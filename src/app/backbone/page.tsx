import { BackboneView } from "../../components/results/BackboneView";

export default function BackbonePage() {
  return (
    <main className="max-w-4xl mx-auto px-12 py-16">
      <h1 className="text-4xl font-light text-white tracking-tight">
        Backbone
      </h1>
      <p className="mt-3 text-[#a8a8a8]">
        The 8-step framework behind every ROI analysis.
      </p>
      <hr className="my-10" />
      <BackboneView />
    </main>
  );
}
