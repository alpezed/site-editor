/**
 * Example of an editable component for a user's Next.js project.
 *
 * Drop a component like this into the connected repository. The Site Editor's
 * component scanner reads the `editor` export to build the inspector UI, and
 * the save workflow writes edited values back into the `content` object before
 * committing and pushing.
 *
 * Convention:
 *   - `export const editor` declares which fields are editable and their type.
 *   - `export const content` (or inline values) holds the current values that
 *     the editor rewrites.
 */

export const editor = {
  title: { type: "text" },
  subtitle: { type: "textarea" },
  ctaLabel: { type: "text" },
  image: { type: "image" },
} as const;

export const content = {
  title: "Welcome to my site",
  subtitle: "Edit this text visually — it commits straight to GitHub.",
  ctaLabel: "Get started",
  image: "/hero.png",
};

export default function Hero() {
  return (
    <section className="hero">
      <h1>{content.title}</h1>
      <p>{content.subtitle}</p>
      <a href="#">{content.ctaLabel}</a>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={content.image} alt="" />
    </section>
  );
}
