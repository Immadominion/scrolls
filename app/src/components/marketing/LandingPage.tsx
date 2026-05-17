import Navigation from "./Navigation";
import Hero from "./Hero";
import BentoFeatures from "./BentoFeatures";
import CreatorFlow from "./CreatorFlow";
import Comparison from "./Comparison";
import Programmatic from "./Programmatic";
import FinalCTA from "./FinalCTA";
import Footer from "./Footer";

export default function LandingPage() {
    return (
        <main className="w-full overflow-x-hidden bg-[color:var(--background-app)]">
            <Navigation />
            <Hero />
            <BentoFeatures />
            <CreatorFlow />
            <Comparison />
            <Programmatic />
            <FinalCTA />
            <Footer />
        </main>
    );
}
