export default function SimpleFooter() {
  return (
    <footer
      data-element-id="SimpleFooter"
      className="bg-slate-900 px-6 py-12 text-slate-300"
    >
      <div className="mx-auto flex max-w-5xl flex-wrap justify-between gap-6">
        <div className="text-lg font-bold text-white">Your Brand</div>
        <nav className="flex flex-wrap gap-6">
          <a href="#" className="text-slate-300 no-underline">
            About
          </a>
          <a href="#" className="text-slate-300 no-underline">
            Pricing
          </a>
          <a href="#" className="text-slate-300 no-underline">
            Contact
          </a>
        </nav>
      </div>
      <p className="mt-8 text-center text-[13px] opacity-60">
        © 2025 Your Brand. All rights reserved.
      </p>
    </footer>
  );
}
