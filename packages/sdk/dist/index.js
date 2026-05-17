// src/network.ts
var DEFAULT_PUBLISHERS = {
  testnet: "https://publisher.walrus-testnet.walrus.space",
  mainnet: "https://publisher.walrus-mainnet.walrus.space",
  devnet: "https://publisher.walrus-testnet.walrus.space"
};
var DEFAULT_AGGREGATORS = {
  testnet: "https://aggregator.walrus-testnet.walrus.space",
  mainnet: "https://aggregator.walrus-mainnet.walrus.space",
  devnet: "https://aggregator.walrus-testnet.walrus.space"
};
var DEFAULT_SUI_RPC = {
  testnet: "https://fullnode.testnet.sui.io:443",
  mainnet: "https://fullnode.mainnet.sui.io:443",
  devnet: "https://fullnode.devnet.sui.io:443"
};
var DEFAULT_PACKAGES = {
  testnet: "0x6418bc0c11e75ef443f7e8fedb9a860b6cc3bfe5909481dc309472ad8b7b10a0",
  mainnet: "",
  devnet: ""
};
var DEFAULT_APP_URLS = {
  testnet: "https://scrolls.wal.app",
  mainnet: "https://scrolls.wal.app",
  devnet: "https://scrolls.wal.app"
};
var DEFAULT_EPOCHS = 53;
function resolveNetworkConfig(network, overrides = {}) {
  return {
    network,
    walrusPublisher: overrides.walrusPublisher ?? DEFAULT_PUBLISHERS[network],
    walrusAggregator: overrides.walrusAggregator ?? DEFAULT_AGGREGATORS[network],
    walrusEpochs: overrides.walrusEpochs ?? DEFAULT_EPOCHS,
    suiRpc: overrides.suiRpc ?? DEFAULT_SUI_RPC[network],
    scrollsPackage: overrides.scrollsPackage ?? DEFAULT_PACKAGES[network],
    suiPrivateKey: overrides.suiPrivateKey,
    appUrl: overrides.appUrl ?? DEFAULT_APP_URLS[network]
  };
}

// src/walrus.ts
var UPLOAD_RETRIES = 2;
var FETCH_RETRIES = 2;
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function uploadBlob(endpoints, data, mimeType) {
  const url = `${endpoints.publisher}/v1/blobs?epochs=${endpoints.epochs}&permanent=true`;
  let lastErr;
  for (let attempt = 0; attempt <= UPLOAD_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": mimeType },
        // Node's fetch accepts Uint8Array directly; cast to BodyInit for TS.
        body: data
      });
      if (!res.ok) {
        if (res.status >= 500 && attempt < UPLOAD_RETRIES) {
          await sleep(400 * (attempt + 1));
          continue;
        }
        const text = await res.text().catch(() => "");
        throw new Error(
          `Walrus upload failed: ${res.status} ${res.statusText} ${text}`.trim()
        );
      }
      const json = await res.json();
      const blobId = json.newlyCreated?.blobObject.blobId ?? json.alreadyCertified?.blobId;
      if (!blobId) {
        throw new Error("Walrus upload: could not parse blobId from response");
      }
      return blobId;
    } catch (err) {
      lastErr = err;
      if (err instanceof TypeError && attempt < UPLOAD_RETRIES) {
        await sleep(400 * (attempt + 1));
        continue;
      }
      throw err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Walrus upload failed");
}
async function uploadJSON(endpoints, data) {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  return uploadBlob(endpoints, bytes, "application/json");
}
async function fetchBlob(endpoints, blobId) {
  const url = `${endpoints.aggregator}/v1/blobs/${encodeURIComponent(blobId)}`;
  let lastErr;
  for (let attempt = 0; attempt <= FETCH_RETRIES; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        if (res.status >= 500 && attempt < FETCH_RETRIES) {
          await sleep(400 * (attempt + 1));
          continue;
        }
        throw new Error(
          `Walrus fetch failed: ${res.status} ${res.statusText}`
        );
      }
      const buf = await res.arrayBuffer();
      return new Uint8Array(buf);
    } catch (err) {
      lastErr = err;
      if (err instanceof TypeError && attempt < FETCH_RETRIES) {
        await sleep(400 * (attempt + 1));
        continue;
      }
      throw err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Walrus fetch failed");
}
async function fetchJSON(endpoints, blobId) {
  const bytes = await fetchBlob(endpoints, blobId);
  const text = new TextDecoder().decode(bytes);
  return JSON.parse(text);
}
function blobUrl(endpoints, blobId) {
  return `${endpoints.aggregator}/v1/blobs/${encodeURIComponent(blobId)}`;
}

// src/registry.ts
import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
var CLOCK_ID = "0x6";
var Registry = class {
  client;
  packageId;
  network;
  keypair;
  constructor(cfg) {
    this.client = new SuiJsonRpcClient({ url: cfg.rpcUrl, network: cfg.network });
    this.packageId = cfg.packageId;
    this.network = cfg.network;
    if (cfg.privateKey) {
      this.keypair = loadKeypair(cfg.privateKey);
    }
  }
  /** Is the Move package configured on this network? */
  get deployed() {
    return !!this.packageId;
  }
  /** Public Sui address derived from the signer, if any. */
  address() {
    return this.keypair?.toSuiAddress() ?? null;
  }
  requireSigner() {
    if (!this.keypair) {
      throw new Error(
        "No Sui signer configured. Set `suiPrivateKey` in your config or run `scrolls init`."
      );
    }
    return this.keypair;
  }
  requireDeployed() {
    if (!this.deployed) {
      throw new Error(
        `Scrolls Move package is not deployed on ${this.network}. Set the package id in your config.`
      );
    }
  }
  // ── Write API ────────────────────────────────
  async publishForm(blobId) {
    this.requireDeployed();
    const keypair = this.requireSigner();
    const tx = new Transaction();
    tx.moveCall({
      target: `${this.packageId}::form_pointer::publish`,
      arguments: [
        tx.pure.vector("u8", blobIdToBytes(blobId)),
        tx.object(CLOCK_ID)
      ]
    });
    const { digest } = await this.signAndExecute(tx, keypair);
    const pointerId = await this.findCreatedObject(digest, "::form_pointer::FormPointer");
    if (!pointerId) {
      throw new Error("publishForm: FormPointer object id missing from response");
    }
    return { pointerId, digest };
  }
  async updateForm(pointerId, newBlobId) {
    this.requireDeployed();
    const keypair = this.requireSigner();
    const tx = new Transaction();
    tx.moveCall({
      target: `${this.packageId}::form_pointer::update`,
      arguments: [
        tx.object(pointerId),
        tx.pure.vector("u8", blobIdToBytes(newBlobId)),
        tx.object(CLOCK_ID)
      ]
    });
    return this.signAndExecute(tx, keypair);
  }
  async recordSubmission(pointerId, submissionBlobId) {
    this.requireDeployed();
    const keypair = this.requireSigner();
    const tx = new Transaction();
    tx.moveCall({
      target: `${this.packageId}::submission_ref::record`,
      arguments: [
        tx.object(pointerId),
        tx.pure.vector("u8", blobIdToBytes(submissionBlobId)),
        tx.object(CLOCK_ID)
      ]
    });
    return this.signAndExecute(tx, keypair);
  }
  // ── Read API ────────────────────────────────
  async getFormPointer(pointerId) {
    if (!this.deployed) return null;
    try {
      const obj = await this.client.getObject({
        id: pointerId,
        options: { showContent: true, showType: true }
      });
      const content = obj.data?.content;
      if (!content || content.dataType !== "moveObject") return null;
      if (!content.type.endsWith("::form_pointer::FormPointer")) return null;
      const fields = content.fields;
      return {
        pointerId,
        owner: String(fields.owner),
        blobId: bytesFieldToString(fields.current_blob_id),
        version: Number(fields.version),
        createdAtMs: Number(fields.created_at_ms),
        updatedAtMs: Number(fields.updated_at_ms)
      };
    } catch {
      return null;
    }
  }
  async listFormsForOwner(owner) {
    if (!this.deployed) return [];
    try {
      const events = await this.client.queryEvents({
        query: {
          MoveEventType: `${this.packageId}::form_pointer::FormPublished`
        },
        order: "descending",
        limit: 200
      });
      const byPointer = /* @__PURE__ */ new Map();
      for (const ev of events.data) {
        if (ev.sender !== owner) continue;
        const f = ev.parsedJson;
        if (!f?.pointer_id) continue;
        if (!byPointer.has(f.pointer_id)) {
          byPointer.set(f.pointer_id, {
            pointerId: f.pointer_id,
            owner: f.owner,
            blobId: bytesFieldToString(f.blob_id),
            version: 1,
            createdAtMs: Number(f.created_at_ms),
            updatedAtMs: Number(f.created_at_ms)
          });
        }
      }
      const updates = await this.client.queryEvents({
        query: {
          MoveEventType: `${this.packageId}::form_pointer::FormUpdated`
        },
        order: "descending",
        limit: 200
      });
      for (const ev of updates.data) {
        const f = ev.parsedJson;
        if (!f?.pointer_id) continue;
        const existing = byPointer.get(f.pointer_id);
        if (!existing) continue;
        const ver = Number(f.version);
        if (ver > existing.version) {
          existing.version = ver;
          existing.blobId = bytesFieldToString(f.new_blob_id);
          existing.updatedAtMs = Number(f.updated_at_ms);
        }
      }
      return Array.from(byPointer.values()).sort(
        (a, b) => b.createdAtMs - a.createdAtMs
      );
    } catch {
      return [];
    }
  }
  async listSubmissions(pointerId, limit = 200) {
    if (!this.deployed) return [];
    try {
      const events = await this.client.queryEvents({
        query: {
          MoveEventType: `${this.packageId}::submission_ref::SubmissionRecorded`
        },
        order: "descending",
        limit
      });
      const out = [];
      const seen = /* @__PURE__ */ new Set();
      for (const ev of events.data) {
        const f = ev.parsedJson;
        if (!f?.form_pointer_id || f.form_pointer_id !== pointerId) continue;
        if (seen.has(f.submission_id)) continue;
        seen.add(f.submission_id);
        out.push({
          submissionId: f.submission_id,
          pointerId: f.form_pointer_id,
          blobId: bytesFieldToString(f.blob_id),
          submitter: f.submitter,
          submittedAtMs: Number(f.submitted_at_ms)
        });
      }
      return out;
    } catch {
      return [];
    }
  }
  async getPolicy(policyId) {
    if (!this.deployed) return null;
    try {
      const obj = await this.client.getObject({
        id: policyId,
        options: { showContent: true, showType: true }
      });
      const content = obj.data?.content;
      if (!content || content.dataType !== "moveObject") return null;
      if (!content.type.endsWith("::seal_policy::FormPolicy")) return null;
      const fields = content.fields;
      const admins = Array.isArray(fields.admins) ? fields.admins : [];
      return {
        policyId,
        owner: String(fields.owner),
        admins
      };
    } catch {
      return null;
    }
  }
  // ── Internals ────────────────────────────────
  async signAndExecute(tx, keypair) {
    const sender = keypair.toSuiAddress();
    tx.setSender(sender);
    const bytes = await tx.build({ client: this.client });
    const { signature } = await keypair.signTransaction(bytes);
    const res = await this.client.executeTransactionBlock({
      transactionBlock: bytes,
      signature,
      options: { showEffects: true }
    });
    const status = res.effects?.status?.status;
    if (status !== "success") {
      throw new Error(
        `Transaction failed: ${res.effects?.status?.error ?? "unknown error"}`
      );
    }
    return { digest: res.digest };
  }
  async findCreatedObject(digest, suffix) {
    await this.client.waitForTransaction({ digest });
    const tx = await this.client.getTransactionBlock({
      digest,
      options: { showObjectChanges: true }
    });
    for (const ch of tx.objectChanges ?? []) {
      if (ch.type === "created" && "objectType" in ch && typeof ch.objectType === "string" && ch.objectType.endsWith(suffix) && "objectId" in ch && typeof ch.objectId === "string") {
        return ch.objectId;
      }
    }
    return null;
  }
};
function blobIdToBytes(blobId) {
  return Array.from(new TextEncoder().encode(blobId));
}
function bytesFieldToString(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return new TextDecoder().decode(new Uint8Array(value));
}
function loadKeypair(suiPrivateKey) {
  const { scheme, secretKey } = decodeSuiPrivateKey(suiPrivateKey);
  if (scheme !== "ED25519") {
    throw new Error(`Unsupported key scheme: ${scheme}. Only ED25519 is supported.`);
  }
  return Ed25519Keypair.fromSecretKey(secretKey);
}
function isPointerId(id) {
  return /^0x[0-9a-fA-F]{1,64}$/.test(id);
}

// src/crypto.ts
var ENVELOPE_VERSION = 1;
var ENVELOPE_ALG = "ECDH-P256+HKDF-SHA256+AES-GCM-256";
var KEY_DERIVATION_INFO = new TextEncoder().encode("scrolls/v1/submission");
var subtle = globalThis.crypto.subtle;
async function generateFormKeypair() {
  const kp = await subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey", "deriveBits"]
  );
  const [publicKeyJwk, privateKeyJwk] = await Promise.all([
    subtle.exportKey("jwk", kp.publicKey),
    subtle.exportKey("jwk", kp.privateKey)
  ]);
  return { publicKeyJwk, privateKeyJwk };
}
async function encryptForForm(plaintext, formPublicKeyJwk) {
  const recipientPub = await subtle.importKey(
    "jwk",
    formPublicKeyJwk,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );
  const ephemeral = await subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey", "deriveBits"]
  );
  const aesKey = await deriveAesKey(ephemeral.privateKey, recipientPub);
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    new TextEncoder().encode(plaintext)
  );
  const ephemeralPubSpki = await subtle.exportKey("spki", ephemeral.publicKey);
  return {
    v: ENVELOPE_VERSION,
    alg: ENVELOPE_ALG,
    ephemeralPub: bytesToB64u(new Uint8Array(ephemeralPubSpki)),
    iv: bytesToB64u(iv),
    ciphertext: bytesToB64u(new Uint8Array(ciphertext))
  };
}
async function decryptForForm(envelope, privateKeyJwk) {
  if (envelope.v !== ENVELOPE_VERSION || envelope.alg !== ENVELOPE_ALG) {
    throw new Error(`Unsupported envelope (v=${envelope.v}, alg=${envelope.alg})`);
  }
  const ownerPriv = await subtle.importKey(
    "jwk",
    privateKeyJwk,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveKey", "deriveBits"]
  );
  const ephemeralPub = await subtle.importKey(
    "spki",
    b64uToBytes(envelope.ephemeralPub),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );
  const aesKey = await deriveAesKey(ownerPriv, ephemeralPub);
  const plaintext = await subtle.decrypt(
    { name: "AES-GCM", iv: b64uToBytes(envelope.iv) },
    aesKey,
    b64uToBytes(envelope.ciphertext)
  );
  return new TextDecoder().decode(plaintext);
}
function isEncryptedEnvelope(x) {
  if (!x || typeof x !== "object") return false;
  const o = x;
  return typeof o.v === "number" && typeof o.alg === "string" && typeof o.ephemeralPub === "string" && typeof o.iv === "string" && typeof o.ciphertext === "string";
}
async function deriveAesKey(privateKey, publicKey) {
  const sharedBits = await subtle.deriveBits(
    { name: "ECDH", public: publicKey },
    privateKey,
    256
  );
  const baseKey = await subtle.importKey(
    "raw",
    sharedBits,
    "HKDF",
    false,
    ["deriveKey"]
  );
  return subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(),
      info: KEY_DERIVATION_INFO
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}
function bytesToB64u(bytes) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64url");
  }
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64uToBytes(b64u) {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(b64u, "base64url"));
  }
  const b64 = b64u.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(b64u.length / 4) * 4, "=");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// src/schema.ts
import { randomUUID } from "crypto";
import { parse as parseYaml } from "yaml";
var VALID_TYPES = /* @__PURE__ */ new Set([
  "short_text",
  "long_text",
  "rich_text",
  "dropdown",
  "multi_select",
  "star_rating",
  "file_upload",
  "video_upload",
  "url",
  "confirm_checkbox"
]);
var TYPES_REQUIRING_OPTIONS = /* @__PURE__ */ new Set([
  "dropdown",
  "multi_select"
]);
var DEFAULT_SETTINGS = {
  isPrivate: false,
  allowAnonymous: true
};
function parseSpecString(input) {
  const trimmed = input.trimStart();
  const looksLikeJson = trimmed.startsWith("{") || trimmed.startsWith("[");
  const raw = looksLikeJson ? JSON.parse(input) : parseYaml(input);
  return assertFormSpec(raw);
}
function assertFormSpec(value) {
  if (!value || typeof value !== "object") {
    throw new Error("Form spec must be an object.");
  }
  const v = value;
  if (typeof v.title !== "string" || v.title.trim() === "") {
    throw new Error("Form spec: `title` is required and must be a non-empty string.");
  }
  if (!Array.isArray(v.fields) || v.fields.length === 0) {
    throw new Error("Form spec: `fields` must be a non-empty array.");
  }
  const fields = v.fields.map((f, i) => assertFieldSpec(f, i));
  const settings = v.settings && typeof v.settings === "object" ? v.settings : void 0;
  return {
    title: v.title,
    description: typeof v.description === "string" ? v.description : void 0,
    settings,
    fields
  };
}
function assertFieldSpec(value, index) {
  if (!value || typeof value !== "object") {
    throw new Error(`fields[${index}] must be an object.`);
  }
  const v = value;
  if (typeof v.type !== "string" || !VALID_TYPES.has(v.type)) {
    throw new Error(
      `fields[${index}].type must be one of: ${[...VALID_TYPES].join(", ")}`
    );
  }
  const type = v.type;
  if (typeof v.label !== "string" || v.label.trim() === "") {
    throw new Error(`fields[${index}].label is required.`);
  }
  if (TYPES_REQUIRING_OPTIONS.has(type)) {
    if (!Array.isArray(v.options) || v.options.length === 0) {
      throw new Error(
        `fields[${index}] (${type}) requires a non-empty \`options\` array.`
      );
    }
  }
  return {
    type,
    label: v.label,
    placeholder: typeof v.placeholder === "string" ? v.placeholder : void 0,
    required: typeof v.required === "boolean" ? v.required : false,
    options: Array.isArray(v.options) ? v.options : void 0,
    maxStars: typeof v.maxStars === "number" ? v.maxStars : void 0,
    maxFileSizeMB: typeof v.maxFileSizeMB === "number" ? v.maxFileSizeMB : void 0,
    acceptedTypes: Array.isArray(v.acceptedTypes) ? v.acceptedTypes.filter((s) => typeof s === "string") : void 0
  };
}
function specToFormConfig(spec, ownerAddress) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const fields = spec.fields.map((f) => normaliseField(f));
  const settings = {
    ...DEFAULT_SETTINGS,
    ...spec.settings ?? {}
  };
  return {
    id: randomUUID(),
    title: spec.title,
    description: spec.description,
    fields,
    settings,
    createdAt: now,
    updatedAt: now,
    ownerAddress
  };
}
function normaliseField(spec) {
  const options = spec.options?.map((o) => {
    if (typeof o === "string") return { id: randomUUID(), label: o };
    return { id: o.id || randomUUID(), label: o.label };
  });
  const out = {
    id: randomUUID(),
    type: spec.type,
    label: spec.label,
    required: spec.required ?? false
  };
  if (spec.placeholder !== void 0) out.placeholder = spec.placeholder;
  if (options !== void 0) out.options = options;
  if (spec.maxStars !== void 0) out.maxStars = spec.maxStars;
  if (spec.maxFileSizeMB !== void 0) out.maxFileSizeMB = spec.maxFileSizeMB;
  if (spec.acceptedTypes !== void 0) out.acceptedTypes = spec.acceptedTypes;
  return out;
}

// src/client.ts
var ScrollsClient = class {
  config;
  registry;
  constructor(options = {}) {
    const network = options.network ?? "testnet";
    this.config = resolveNetworkConfig(network, options);
    this.registry = new Registry({
      network: this.config.network,
      rpcUrl: this.config.suiRpc,
      packageId: this.config.scrollsPackage,
      privateKey: this.config.suiPrivateKey
    });
  }
  get walrus() {
    return {
      publisher: this.config.walrusPublisher,
      aggregator: this.config.walrusAggregator,
      epochs: this.config.walrusEpochs ?? DEFAULT_EPOCHS
    };
  }
  /** Sui address derived from the configured signer, or `null`. */
  address() {
    return this.registry.address();
  }
  // ── Create ──────────────────────────────────
  /**
   * Build, upload and (optionally) register a new form.
   *
   * Accepts a `FormSpec` (the human-friendly shape) or a raw spec
   * string in YAML or JSON. Returns the canonical `formId` — which
   * is the Sui `pointerId` when on-chain registry is available, or
   * the Walrus `blobId` otherwise.
   */
  async createForm(input, opts = {}) {
    const owner = opts.ownerAddress ?? this.registry.address() ?? "0x0";
    const config = this.buildFormConfig(input, owner);
    let decryptionKey;
    if (config.settings.isPrivate && !config.encryptionPublicKey) {
      decryptionKey = await generateFormKeypair();
      config.encryptionPublicKey = decryptionKey.publicKeyJwk;
    }
    const blobId = await uploadJSON(this.walrus, config);
    let pointerId;
    let txDigest;
    if (this.registry.deployed && this.registry.address()) {
      const result = await this.registry.publishForm(blobId);
      pointerId = result.pointerId;
      txDigest = result.digest;
    }
    const formId = pointerId ?? blobId;
    return {
      formId,
      blobId,
      pointerId,
      txDigest,
      shareUrl: this.shareUrl(formId),
      decryptionKey
    };
  }
  buildFormConfig(input, owner) {
    if (typeof input === "string") {
      return specToFormConfig(parseSpecString(input), owner);
    }
    if (typeof input.id === "string" && Array.isArray(input.fields) && input.settings) {
      return { ...input };
    }
    return specToFormConfig(assertFormSpec(input), owner);
  }
  // ── Read ────────────────────────────────────
  /**
   * Fetch the latest form config for a given id (FormPointer object
   * id or Walrus blob id). When given a pointer id, the current
   * blob is resolved on-chain first.
   */
  async getForm(formId) {
    const blobId = await this.resolveBlobId(formId);
    return fetchJSON(this.walrus, blobId);
  }
  async resolveBlobId(formId) {
    if (!isPointerId(formId)) return formId;
    if (!this.registry.deployed) {
      throw new Error(
        `Form id "${formId}" looks like a Sui object but no Move package is configured for ${this.config.network}.`
      );
    }
    const summary = await this.registry.getFormPointer(formId);
    if (!summary) {
      throw new Error(`FormPointer ${formId} not found on ${this.config.network}.`);
    }
    return summary.blobId;
  }
  /** List all forms published by the given address (on-chain only). */
  async listForms(address) {
    const owner = address ?? this.registry.address();
    if (!owner) {
      throw new Error("listForms: no address provided and no signer configured.");
    }
    return this.registry.listFormsForOwner(owner);
  }
  // ── Submit ──────────────────────────────────
  /**
   * Build and upload a submission. If the form is private and has an
   * `encryptionPublicKey`, the submission JSON is wrapped in an
   * ECIES envelope before upload.
   *
   * When the on-chain registry is configured, a `SubmissionRecorded`
   * event is also emitted so the form owner can see the response
   * cross-device.
   */
  async submit(formId, responses, opts = {}) {
    const form = await this.getForm(formId);
    const submission = {
      id: crypto.randomUUID(),
      formId,
      responses,
      submittedAt: (/* @__PURE__ */ new Date()).toISOString(),
      submitterAddress: opts.submitterAddress ?? this.registry.address() ?? void 0
    };
    let payload = submission;
    if (form.settings.isPrivate) {
      if (!form.encryptionPublicKey) {
        throw new Error(
          "Form is marked private but has no encryptionPublicKey \u2014 cannot submit."
        );
      }
      const envelope = await encryptForForm(
        JSON.stringify(submission),
        form.encryptionPublicKey
      );
      payload = envelope;
    }
    const blobId = await uploadJSON(this.walrus, payload);
    let txDigest;
    if (this.registry.deployed && this.registry.address() && isPointerId(formId)) {
      const res = await this.registry.recordSubmission(formId, blobId);
      txDigest = res.digest;
    }
    return { submissionId: submission.id, blobId, txDigest };
  }
  // ── Submissions read ────────────────────────
  /**
   * Fetch all submissions recorded on-chain for a form, optionally
   * decrypting them with the provided private key (JWK).
   *
   * Only available when the form id is a Sui pointer id and the
   * registry is configured — anonymous/local forms have no
   * cross-device index.
   */
  async listSubmissions(formId, opts = {}) {
    if (!isPointerId(formId)) {
      throw new Error(
        "listSubmissions: form id must be a Sui pointer id (0x\u2026) to enumerate submissions."
      );
    }
    const events = await this.registry.listSubmissions(formId, opts.limit ?? 200);
    const out = [];
    await Promise.all(
      events.map(async (ev) => {
        try {
          const blob = await fetchJSON(
            this.walrus,
            ev.blobId
          );
          if (isEncryptedEnvelope(blob)) {
            if (!opts.privateKeyJwk) {
              out.push({
                id: ev.submissionId,
                formId,
                responses: [],
                submittedAt: new Date(ev.submittedAtMs).toISOString(),
                submitterAddress: ev.submitter,
                walrusBlobId: ev.blobId,
                submissionRefId: ev.submissionId,
                wasEncrypted: true
              });
              return;
            }
            const plaintext = await decryptForForm(blob, opts.privateKeyJwk);
            const sub = JSON.parse(plaintext);
            out.push({
              ...sub,
              walrusBlobId: ev.blobId,
              submissionRefId: ev.submissionId,
              wasEncrypted: true
            });
          } else {
            out.push({
              ...blob,
              walrusBlobId: ev.blobId,
              submissionRefId: ev.submissionId,
              wasEncrypted: false
            });
          }
        } catch {
        }
      })
    );
    return out.sort(
      (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
    );
  }
  /**
   * Convenience: dump submissions as CSV.
   * Columns: timestamp, submitter, then one column per field id.
   */
  async exportCsv(formId, opts = {}) {
    const form = await this.getForm(formId);
    const subs = await this.listSubmissions(formId, opts);
    const header = [
      "submitted_at",
      "submitter",
      ...form.fields.map((f) => f.label)
    ];
    const rows = subs.map((s) => {
      const cells = [s.submittedAt, s.submitterAddress ?? ""];
      for (const field of form.fields) {
        const r = s.responses.find((x) => x.fieldId === field.id);
        cells.push(csvEscape(stringifyResponse(r?.value ?? null)));
      }
      return cells.join(",");
    });
    return [header.map(csvEscape).join(","), ...rows].join("\n");
  }
  // ── URL helpers ─────────────────────────────
  shareUrl(formId) {
    return `${this.config.appUrl}/f?id=${encodeURIComponent(formId)}`;
  }
  responsesUrl(formId) {
    return `${this.config.appUrl}/responses?id=${encodeURIComponent(formId)}`;
  }
};
function stringifyResponse(value) {
  if (value === null || value === void 0) return "";
  if (Array.isArray(value)) return value.join(" | ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
function csvEscape(s) {
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
export {
  DEFAULT_AGGREGATORS,
  DEFAULT_APP_URLS,
  DEFAULT_EPOCHS,
  DEFAULT_PACKAGES,
  DEFAULT_PUBLISHERS,
  DEFAULT_SUI_RPC,
  Registry,
  ScrollsClient,
  assertFormSpec,
  blobUrl,
  decryptForForm,
  encryptForForm,
  fetchBlob,
  fetchJSON,
  generateFormKeypair,
  isEncryptedEnvelope,
  isPointerId,
  loadKeypair,
  parseSpecString,
  resolveNetworkConfig,
  specToFormConfig,
  uploadBlob,
  uploadJSON
};
