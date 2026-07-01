/**
 * Static catalog of pre-built sections shown in the editor's Explore →
 * Section Gallery. "Add to Site" writes the section's component file (once, keyed
 * by `name`) and inserts a bare `<Name/>` as the last child of the clicked
 * container — located by its stable data-builder-id (see applySections in
 * editor/sections.ts + appendChildByBuilderId).
 *
 * This module is CLIENT-SAFE (imported by the gallery): metadata only. The actual
 * component source lives as real Tailwind `.tsx` files under
 * `sandbox-templates/_shared/components/<name>.tsx`; the server reads them via
 * `getComponentSource(name)` in catalog-source.ts (fs — server only).
 *
 * `name` is the PascalCase identifier used as the file name, the JSX import/tag,
 * and the component's `data-element-id`. `label` is the human text for the gallery.
 *
 * `previewHtml` is the component's markup as plain HTML (className → class, maps
 * expanded), injected straight into the live preview iframe the instant a section
 * is added — the user sees it before the sandbox file write + recompile. Keep it
 * in sync with the matching component file (both use the same Tailwind classes).
 *
 * Add a section = drop a `<name>.tsx` file in _shared/components + an entry below.
 * Add a category = extend CATEGORIES.
 */

export interface Section {
  /** PascalCase id: file name, JSX import/tag, and data-element-id. */
  name: string;
  /** Human-friendly label shown in the gallery. */
  label: string;
  category: string;
  /** Optional preview image URL; the gallery falls back to a gradient + label. */
  thumb?: string;
  /** Rendered HTML for instant in-iframe preview (mirror of the component file). */
  previewHtml: string;
}

export const CATEGORIES = [
  "Basic Elements",
  "Headers",
  "AI Widgets",
  "Products & Features",
  "How It Works",
  "About / Team",
  "Blog & Press",
  "Testimonials",
  "Text",
  "Forms & FAQ",
  "Gallery & Media",
  "Pricing",
  "Call to Action",
  "Footer",
] as const;

export type Category = (typeof CATEGORIES)[number];

const section = (s: Section) => s;

export const SECTIONS: Section[] = [
  // ── Basic Elements — primitives inserted via the same staging pipeline.
  section({
    name: "BlankSection",
    label: "Section",
    category: "Basic Elements",
    previewHtml: `<section data-element-id="BlankSection" class="px-6 py-16"><div class="mx-auto max-w-5xl">Section</div></section>`,
  }),
  section({
    name: "Container",
    label: "Container",
    category: "Basic Elements",
    previewHtml: `<div data-element-id="Container" class="mx-auto max-w-5xl p-6">Container</div>`,
  }),
  section({
    name: "Heading",
    label: "Heading",
    category: "Basic Elements",
    previewHtml: `<h2 data-element-id="Heading" class="my-4 text-3xl font-bold">Heading</h2>`,
  }),
  section({
    name: "TextBlock",
    label: "Text",
    category: "Basic Elements",
    previewHtml: `<p data-element-id="TextBlock" class="my-3 text-base leading-relaxed">Edit this text.</p>`,
  }),
  section({
    name: "ButtonBlock",
    label: "Button",
    category: "Basic Elements",
    previewHtml: `<a href="#" data-element-id="ButtonBlock" class="m-3 inline-block rounded-lg bg-indigo-600 px-6 py-3 font-semibold text-white no-underline">Button</a>`,
  }),
  section({
    name: "ImageBlock",
    label: "Image",
    category: "Basic Elements",
    previewHtml: `<img data-element-id="ImageBlock" src="https://placehold.co/600x320" alt="" class="mx-auto my-3 block max-w-full rounded-xl" />`,
  }),
  section({
    name: "SplitImageLeftHero",
    label: "Split Image Left",
    category: "Headers",
    previewHtml: `<section data-element-id="SplitImageLeftHero" class="flex flex-wrap items-center gap-8 bg-slate-900 px-6 py-16 text-white"><div class="min-w-[280px] flex-1"><h1 class="mb-3 text-4xl font-extrabold leading-tight">Welcome to Our Business</h1><p class="mb-6 text-lg opacity-80">We deliver exceptional service tailored to you.</p><a href="#" class="inline-block rounded-lg bg-white px-6 py-3 font-semibold text-slate-900 no-underline">Get Started</a></div><div class="h-72 min-w-[280px] flex-1 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500"></div></section>`,
  }),
  section({
    name: "CenteredHero",
    label: "Centered Hero",
    category: "Headers",
    previewHtml: `<section data-element-id="CenteredHero" class="bg-white px-6 py-24 text-center text-slate-900"><h1 class="mb-4 text-5xl font-extrabold leading-tight">Build something people love</h1><p class="mx-auto mb-8 max-w-2xl text-xl text-slate-600">A clear, compelling subheadline that explains the value in one sentence.</p><div class="flex flex-wrap justify-center gap-3"><a href="#" class="rounded-lg bg-indigo-600 px-7 py-3 font-semibold text-white no-underline">Get Started</a><a href="#" class="rounded-lg border border-slate-300 px-7 py-3 font-semibold text-slate-900 no-underline">Learn More</a></div></section>`,
  }),
  section({
    name: "ThreeUpFeatures",
    label: "Three-Up Features",
    category: "Products & Features",
    previewHtml: `<section data-element-id="ThreeUpFeatures" class="bg-slate-50 px-6 py-[72px] text-slate-900"><h2 class="mb-12 text-center text-3xl font-extrabold">Everything you need</h2><div class="mx-auto grid max-w-5xl grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"><div class="rounded-xl border border-slate-200 bg-white p-6"><h3 class="mb-2 text-xl font-bold">Fast</h3><p class="text-slate-600">Ships in milliseconds, not minutes.</p></div><div class="rounded-xl border border-slate-200 bg-white p-6"><h3 class="mb-2 text-xl font-bold">Reliable</h3><p class="text-slate-600">Battle-tested and production ready.</p></div><div class="rounded-xl border border-slate-200 bg-white p-6"><h3 class="mb-2 text-xl font-bold">Simple</h3><p class="text-slate-600">An API you can learn in an afternoon.</p></div></div></section>`,
  }),
  section({
    name: "ThreeTierPricing",
    label: "Three-Tier Pricing",
    category: "Pricing",
    previewHtml: `<section data-element-id="ThreeTierPricing" class="bg-white px-6 py-[72px] text-slate-900"><h2 class="mb-12 text-center text-3xl font-extrabold">Simple pricing</h2><div class="mx-auto grid max-w-4xl grid-cols-1 gap-6 sm:grid-cols-3"><div class="rounded-xl border border-slate-200 p-7"><h3 class="mb-1 text-lg font-bold">Starter</h3><p class="mb-4 text-4xl font-extrabold">$0<span class="text-sm font-normal text-slate-500">/mo</span></p><ul class="mb-6 list-none space-y-1 p-0 text-slate-600"><li>✓ 1 project</li><li>✓ Community support</li></ul><a href="#" class="block rounded-lg bg-indigo-600 py-2.5 text-center font-semibold text-white no-underline">Choose</a></div><div class="rounded-xl border border-slate-200 p-7"><h3 class="mb-1 text-lg font-bold">Pro</h3><p class="mb-4 text-4xl font-extrabold">$29<span class="text-sm font-normal text-slate-500">/mo</span></p><ul class="mb-6 list-none space-y-1 p-0 text-slate-600"><li>✓ Unlimited projects</li><li>✓ Priority support</li><li>✓ Analytics</li></ul><a href="#" class="block rounded-lg bg-indigo-600 py-2.5 text-center font-semibold text-white no-underline">Choose</a></div><div class="rounded-xl border border-slate-200 p-7"><h3 class="mb-1 text-lg font-bold">Team</h3><p class="mb-4 text-4xl font-extrabold">$99<span class="text-sm font-normal text-slate-500">/mo</span></p><ul class="mb-6 list-none space-y-1 p-0 text-slate-600"><li>✓ Everything in Pro</li><li>✓ SSO</li><li>✓ Audit logs</li></ul><a href="#" class="block rounded-lg bg-indigo-600 py-2.5 text-center font-semibold text-white no-underline">Choose</a></div></div></section>`,
  }),
  section({
    name: "SingleQuote",
    label: "Single Quote",
    category: "Testimonials",
    previewHtml: `<section data-element-id="SingleQuote" class="bg-slate-900 px-6 py-20 text-center text-white"><p class="mx-auto mb-6 max-w-3xl text-3xl font-semibold leading-snug">“This product changed how our whole team works. We shipped in days what used to take months.”</p><p class="opacity-70">— Alex Rivera, CEO at Acme</p></section>`,
  }),
  section({
    name: "CtaBanner",
    label: "CTA Banner",
    category: "Call to Action",
    previewHtml: `<section data-element-id="CtaBanner" class="bg-gradient-to-br from-indigo-600 to-violet-500 px-6 py-16 text-center text-white"><h2 class="mb-3 text-3xl font-extrabold">Ready to get started?</h2><p class="mb-7 text-lg opacity-90">Join thousands of teams building with us today.</p><a href="#" class="inline-block rounded-lg bg-white px-8 py-3.5 font-bold text-indigo-600 no-underline">Start free trial</a></section>`,
  }),
  section({
    name: "SimpleFooter",
    label: "Simple Footer",
    category: "Footer",
    previewHtml: `<footer data-element-id="SimpleFooter" class="bg-slate-900 px-6 py-12 text-slate-300"><div class="mx-auto flex max-w-5xl flex-wrap justify-between gap-6"><div class="text-lg font-bold text-white">Your Brand</div><nav class="flex flex-wrap gap-6"><a href="#" class="text-slate-300 no-underline">About</a><a href="#" class="text-slate-300 no-underline">Pricing</a><a href="#" class="text-slate-300 no-underline">Contact</a></nav></div><p class="mt-8 text-center text-[13px] opacity-60">© 2025 Your Brand. All rights reserved.</p></footer>`,
  }),
];

const byName = new Map(SECTIONS.map((s) => [s.name, s]));

export function getSection(name: string): Section | undefined {
  return byName.get(name);
}
