/**
 * Static catalog of pre-built sections shown in the editor's Explore →
 * Section Gallery. "Add to Site" stages a section in the editor's pending state;
 * on sync/save its `code` is written as a component file and a `<ImportName/>`
 * tag is appended to the site's home route (see applySectionAdds in ast.ts).
 *
 * ponytail: each section's `code` is a self-contained default-export component
 * using inline styles only — no Tailwind/shadcn/icon deps — so it renders in any
 * Next.js repo regardless of its CSS setup. Richer themed sections can come later
 * once we read the host's design tokens.
 *
 * `previewHtml` is the same markup as plain HTML (inline styles → strings). The
 * editor injects it straight into the live preview iframe the instant a section
 * is added, so the user sees it without waiting for the sandbox file write +
 * recompile. Keep it in sync with `code` when editing a section.
 *
 * Add a section = append an entry below. Add a category = extend CATEGORIES.
 */

export interface Section {
  id: string;
  name: string;
  category: string;
  /** Optional preview image URL; the gallery falls back to a gradient + name. */
  thumb?: string;
  /** PascalCase component name used for the import + JSX tag. */
  importName: string;
  /** Full self-contained TSX module (default export). */
  code: string;
  /** Rendered HTML for instant in-iframe preview (mirror of `code`). */
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
  //    Inline-styled for portability; the style inspector layers Tailwind
  //    classes on top regardless of the host's CSS setup.
  section({
    id: "el-section",
    name: "Section",
    category: "Basic Elements",
    importName: "BlankSection",
    code: `export default function BlankSection() {
  return (
    <section style={{ padding: "64px 24px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>Section</div>
    </section>
  );
}
`,
    previewHtml: `<section style="padding:64px 24px"><div style="max-width:1100px;margin:0 auto">Section</div></section>`,
  }),
  section({
    id: "el-container",
    name: "Container",
    category: "Basic Elements",
    importName: "Container",
    code: `export default function Container() {
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>Container</div>
  );
}
`,
    previewHtml: `<div style="max-width:1100px;margin:0 auto;padding:24px">Container</div>`,
  }),
  section({
    id: "el-heading",
    name: "Heading",
    category: "Basic Elements",
    importName: "Heading",
    code: `export default function Heading() {
  return <h2 style={{ fontSize: 32, fontWeight: 700, margin: "16px 0" }}>Heading</h2>;
}
`,
    previewHtml: `<h2 style="font-size:32px;font-weight:700;margin:16px 0">Heading</h2>`,
  }),
  section({
    id: "el-text",
    name: "Text",
    category: "Basic Elements",
    importName: "TextBlock",
    code: `export default function TextBlock() {
  return <p style={{ fontSize: 16, lineHeight: 1.6, margin: "12px 0" }}>Edit this text.</p>;
}
`,
    previewHtml: `<p style="font-size:16px;line-height:1.6;margin:12px 0">Edit this text.</p>`,
  }),
  section({
    id: "el-button",
    name: "Button",
    category: "Basic Elements",
    importName: "ButtonBlock",
    code: `export default function ButtonBlock() {
  return (
    <a href="#" style={{ display: "inline-block", background: "#4f46e5", color: "#fff", padding: "12px 24px", borderRadius: 8, fontWeight: 600, textDecoration: "none", margin: 12 }}>Button</a>
  );
}
`,
    previewHtml: `<a href="#" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;border-radius:8px;font-weight:600;text-decoration:none;margin:12px">Button</a>`,
  }),
  section({
    id: "el-image",
    name: "Image",
    category: "Basic Elements",
    importName: "ImageBlock",
    code: `export default function ImageBlock() {
  return <img src="https://placehold.co/600x320" alt="" style={{ maxWidth: "100%", borderRadius: 12, display: "block", margin: "12px auto" }} />;
}
`,
    previewHtml: `<img src="https://placehold.co/600x320" alt="" style="max-width:100%;border-radius:12px;display:block;margin:12px auto" />`,
  }),
  section({
    id: "split-image-left",
    name: "Split Image Left",
    category: "Headers",
    importName: "SplitImageLeftHero",
    code: `export default function SplitImageLeftHero() {
  return (
    <section style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 32, padding: "64px 24px", background: "#0f172a", color: "#fff" }}>
      <div style={{ flex: "1 1 320px", minWidth: 280 }}>
        <h1 style={{ fontSize: 40, fontWeight: 800, margin: "0 0 12px", lineHeight: 1.1 }}>Welcome to Our Business</h1>
        <p style={{ fontSize: 18, opacity: 0.8, margin: "0 0 24px" }}>We deliver exceptional service tailored to you.</p>
        <a href="#" style={{ display: "inline-block", background: "#fff", color: "#0f172a", padding: "12px 24px", borderRadius: 8, fontWeight: 600, textDecoration: "none" }}>Get Started</a>
      </div>
      <div style={{ flex: "1 1 320px", minWidth: 280, height: 280, borderRadius: 16, background: "linear-gradient(135deg,#6366f1,#8b5cf6)" }} />
    </section>
  );
}
`,
    previewHtml: `<section style="display:flex;flex-wrap:wrap;align-items:center;gap:32px;padding:64px 24px;background:#0f172a;color:#fff"><div style="flex:1 1 320px;min-width:280px"><h1 style="font-size:40px;font-weight:800;margin:0 0 12px;line-height:1.1">Welcome to Our Business</h1><p style="font-size:18px;opacity:0.8;margin:0 0 24px">We deliver exceptional service tailored to you.</p><a href="#" style="display:inline-block;background:#fff;color:#0f172a;padding:12px 24px;border-radius:8px;font-weight:600;text-decoration:none">Get Started</a></div><div style="flex:1 1 320px;min-width:280px;height:280px;border-radius:16px;background:linear-gradient(135deg,#6366f1,#8b5cf6)"></div></section>`,
  }),
  section({
    id: "centered-hero",
    name: "Centered Hero",
    category: "Headers",
    importName: "CenteredHero",
    code: `export default function CenteredHero() {
  return (
    <section style={{ textAlign: "center", padding: "96px 24px", background: "#fff", color: "#0f172a" }}>
      <h1 style={{ fontSize: 48, fontWeight: 800, margin: "0 0 16px", lineHeight: 1.1 }}>Build something people love</h1>
      <p style={{ fontSize: 20, color: "#475569", maxWidth: 640, margin: "0 auto 32px" }}>A clear, compelling subheadline that explains the value in one sentence.</p>
      <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
        <a href="#" style={{ background: "#4f46e5", color: "#fff", padding: "12px 28px", borderRadius: 8, fontWeight: 600, textDecoration: "none" }}>Get Started</a>
        <a href="#" style={{ border: "1px solid #cbd5e1", color: "#0f172a", padding: "12px 28px", borderRadius: 8, fontWeight: 600, textDecoration: "none" }}>Learn More</a>
      </div>
    </section>
  );
}
`,
    previewHtml: `<section style="text-align:center;padding:96px 24px;background:#fff;color:#0f172a"><h1 style="font-size:48px;font-weight:800;margin:0 0 16px;line-height:1.1">Build something people love</h1><p style="font-size:20px;color:#475569;max-width:640px;margin:0 auto 32px">A clear, compelling subheadline that explains the value in one sentence.</p><div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap"><a href="#" style="background:#4f46e5;color:#fff;padding:12px 28px;border-radius:8px;font-weight:600;text-decoration:none">Get Started</a><a href="#" style="border:1px solid #cbd5e1;color:#0f172a;padding:12px 28px;border-radius:8px;font-weight:600;text-decoration:none">Learn More</a></div></section>`,
  }),
  section({
    id: "feature-grid",
    name: "Three-Up Features",
    category: "Products & Features",
    importName: "ThreeUpFeatures",
    code: `export default function ThreeUpFeatures() {
  const items = [
    { t: "Fast", d: "Ships in milliseconds, not minutes." },
    { t: "Reliable", d: "Battle-tested and production ready." },
    { t: "Simple", d: "An API you can learn in an afternoon." },
  ];
  return (
    <section style={{ padding: "72px 24px", background: "#f8fafc", color: "#0f172a" }}>
      <h2 style={{ textAlign: "center", fontSize: 32, fontWeight: 800, margin: "0 0 48px" }}>Everything you need</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 24, maxWidth: 1000, margin: "0 auto" }}>
        {items.map((it) => (
          <div key={it.t} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 24 }}>
            <h3 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 8px" }}>{it.t}</h3>
            <p style={{ color: "#475569", margin: 0 }}>{it.d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
`,
    previewHtml: `<section style="padding:72px 24px;background:#f8fafc;color:#0f172a"><h2 style="text-align:center;font-size:32px;font-weight:800;margin:0 0 48px">Everything you need</h2><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:24px;max-width:1000px;margin:0 auto"><div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:24px"><h3 style="font-size:20px;font-weight:700;margin:0 0 8px">Fast</h3><p style="color:#475569;margin:0">Ships in milliseconds, not minutes.</p></div><div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:24px"><h3 style="font-size:20px;font-weight:700;margin:0 0 8px">Reliable</h3><p style="color:#475569;margin:0">Battle-tested and production ready.</p></div><div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:24px"><h3 style="font-size:20px;font-weight:700;margin:0 0 8px">Simple</h3><p style="color:#475569;margin:0">An API you can learn in an afternoon.</p></div></div></section>`,
  }),
  section({
    id: "pricing-three-tier",
    name: "Three-Tier Pricing",
    category: "Pricing",
    importName: "ThreeTierPricing",
    code: `export default function ThreeTierPricing() {
  const tiers = [
    { name: "Starter", price: "$0", features: ["1 project", "Community support"] },
    { name: "Pro", price: "$29", features: ["Unlimited projects", "Priority support", "Analytics"] },
    { name: "Team", price: "$99", features: ["Everything in Pro", "SSO", "Audit logs"] },
  ];
  return (
    <section style={{ padding: "72px 24px", background: "#fff", color: "#0f172a" }}>
      <h2 style={{ textAlign: "center", fontSize: 32, fontWeight: 800, margin: "0 0 48px" }}>Simple pricing</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 24, maxWidth: 960, margin: "0 auto" }}>
        {tiers.map((t) => (
          <div key={t.name} style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 28 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 4px" }}>{t.name}</h3>
            <p style={{ fontSize: 36, fontWeight: 800, margin: "0 0 16px" }}>{t.price}<span style={{ fontSize: 14, fontWeight: 400, color: "#64748b" }}>/mo</span></p>
            <ul style={{ listStyle: "none", padding: 0, margin: "0 0 24px", color: "#475569" }}>
              {t.features.map((f) => (<li key={f} style={{ padding: "4px 0" }}>✓ {f}</li>))}
            </ul>
            <a href="#" style={{ display: "block", textAlign: "center", background: "#4f46e5", color: "#fff", padding: "10px 0", borderRadius: 8, fontWeight: 600, textDecoration: "none" }}>Choose</a>
          </div>
        ))}
      </div>
    </section>
  );
}
`,
    previewHtml: `<section style="padding:72px 24px;background:#fff;color:#0f172a"><h2 style="text-align:center;font-size:32px;font-weight:800;margin:0 0 48px">Simple pricing</h2><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:24px;max-width:960px;margin:0 auto"><div style="border:1px solid #e2e8f0;border-radius:12px;padding:28px"><h3 style="font-size:18px;font-weight:700;margin:0 0 4px">Starter</h3><p style="font-size:36px;font-weight:800;margin:0 0 16px">$0<span style="font-size:14px;font-weight:400;color:#64748b">/mo</span></p><ul style="list-style:none;padding:0;margin:0 0 24px;color:#475569"><li style="padding:4px 0">✓ 1 project</li><li style="padding:4px 0">✓ Community support</li></ul><a href="#" style="display:block;text-align:center;background:#4f46e5;color:#fff;padding:10px 0;border-radius:8px;font-weight:600;text-decoration:none">Choose</a></div><div style="border:1px solid #e2e8f0;border-radius:12px;padding:28px"><h3 style="font-size:18px;font-weight:700;margin:0 0 4px">Pro</h3><p style="font-size:36px;font-weight:800;margin:0 0 16px">$29<span style="font-size:14px;font-weight:400;color:#64748b">/mo</span></p><ul style="list-style:none;padding:0;margin:0 0 24px;color:#475569"><li style="padding:4px 0">✓ Unlimited projects</li><li style="padding:4px 0">✓ Priority support</li><li style="padding:4px 0">✓ Analytics</li></ul><a href="#" style="display:block;text-align:center;background:#4f46e5;color:#fff;padding:10px 0;border-radius:8px;font-weight:600;text-decoration:none">Choose</a></div><div style="border:1px solid #e2e8f0;border-radius:12px;padding:28px"><h3 style="font-size:18px;font-weight:700;margin:0 0 4px">Team</h3><p style="font-size:36px;font-weight:800;margin:0 0 16px">$99<span style="font-size:14px;font-weight:400;color:#64748b">/mo</span></p><ul style="list-style:none;padding:0;margin:0 0 24px;color:#475569"><li style="padding:4px 0">✓ Everything in Pro</li><li style="padding:4px 0">✓ SSO</li><li style="padding:4px 0">✓ Audit logs</li></ul><a href="#" style="display:block;text-align:center;background:#4f46e5;color:#fff;padding:10px 0;border-radius:8px;font-weight:600;text-decoration:none">Choose</a></div></div></section>`,
  }),
  section({
    id: "testimonial-quote",
    name: "Single Quote",
    category: "Testimonials",
    importName: "SingleQuote",
    code: `export default function SingleQuote() {
  return (
    <section style={{ padding: "80px 24px", background: "#0f172a", color: "#fff", textAlign: "center" }}>
      <p style={{ fontSize: 28, fontWeight: 600, maxWidth: 720, margin: "0 auto 24px", lineHeight: 1.4 }}>
        “This product changed how our whole team works. We shipped in days what used to take months.”
      </p>
      <p style={{ opacity: 0.7, margin: 0 }}>— Alex Rivera, CEO at Acme</p>
    </section>
  );
}
`,
    previewHtml: `<section style="padding:80px 24px;background:#0f172a;color:#fff;text-align:center"><p style="font-size:28px;font-weight:600;max-width:720px;margin:0 auto 24px;line-height:1.4">“This product changed how our whole team works. We shipped in days what used to take months.”</p><p style="opacity:0.7;margin:0">— Alex Rivera, CEO at Acme</p></section>`,
  }),
  section({
    id: "cta-banner",
    name: "CTA Banner",
    category: "Call to Action",
    importName: "CtaBanner",
    code: `export default function CtaBanner() {
  return (
    <section style={{ padding: "64px 24px", background: "linear-gradient(135deg,#4f46e5,#8b5cf6)", color: "#fff", textAlign: "center" }}>
      <h2 style={{ fontSize: 32, fontWeight: 800, margin: "0 0 12px" }}>Ready to get started?</h2>
      <p style={{ fontSize: 18, opacity: 0.9, margin: "0 0 28px" }}>Join thousands of teams building with us today.</p>
      <a href="#" style={{ display: "inline-block", background: "#fff", color: "#4f46e5", padding: "14px 32px", borderRadius: 8, fontWeight: 700, textDecoration: "none" }}>Start free trial</a>
    </section>
  );
}
`,
    previewHtml: `<section style="padding:64px 24px;background:linear-gradient(135deg,#4f46e5,#8b5cf6);color:#fff;text-align:center"><h2 style="font-size:32px;font-weight:800;margin:0 0 12px">Ready to get started?</h2><p style="font-size:18px;opacity:0.9;margin:0 0 28px">Join thousands of teams building with us today.</p><a href="#" style="display:inline-block;background:#fff;color:#4f46e5;padding:14px 32px;border-radius:8px;font-weight:700;text-decoration:none">Start free trial</a></section>`,
  }),
  section({
    id: "footer-simple",
    name: "Simple Footer",
    category: "Footer",
    importName: "SimpleFooter",
    code: `export default function SimpleFooter() {
  return (
    <footer style={{ padding: "48px 24px", background: "#0f172a", color: "#cbd5e1" }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 24, maxWidth: 1000, margin: "0 auto" }}>
        <div style={{ fontWeight: 700, fontSize: 18, color: "#fff" }}>Your Brand</div>
        <nav style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <a href="#" style={{ color: "#cbd5e1", textDecoration: "none" }}>About</a>
          <a href="#" style={{ color: "#cbd5e1", textDecoration: "none" }}>Pricing</a>
          <a href="#" style={{ color: "#cbd5e1", textDecoration: "none" }}>Contact</a>
        </nav>
      </div>
      <p style={{ textAlign: "center", marginTop: 32, fontSize: 13, opacity: 0.6 }}>© 2025 Your Brand. All rights reserved.</p>
    </footer>
  );
}
`,
    previewHtml: `<footer style="padding:48px 24px;background:#0f172a;color:#cbd5e1"><div style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:24px;max-width:1000px;margin:0 auto"><div style="font-weight:700;font-size:18px;color:#fff">Your Brand</div><nav style="display:flex;gap:24px;flex-wrap:wrap"><a href="#" style="color:#cbd5e1;text-decoration:none">About</a><a href="#" style="color:#cbd5e1;text-decoration:none">Pricing</a><a href="#" style="color:#cbd5e1;text-decoration:none">Contact</a></nav></div><p style="text-align:center;margin-top:32px;font-size:13px;opacity:0.6">© 2025 Your Brand. All rights reserved.</p></footer>`,
  }),
];

const byId = new Map(SECTIONS.map((s) => [s.id, s]));

export function getSection(id: string): Section | undefined {
  return byId.get(id);
}

/** Repo-relative path the section's component is written to on sync/save. */
export function sectionFilePath(id: string): string {
  return `components/site-editor-sections/${id}.tsx`;
}
