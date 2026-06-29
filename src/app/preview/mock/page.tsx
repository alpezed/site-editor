/**
 * Placeholder preview rendered when SANDBOX_DRIVER=mock. The real editor embeds
 * the E2B sandbox dev-server URL here instead.
 */
export default function MockPreview() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white text-center text-sm text-zinc-500">
      <div>
        <p className="font-medium text-zinc-700">Mock preview</p>
        <p>Connect E2B (SANDBOX_DRIVER=e2b) to render the live site here.</p>
      </div>
    </div>
  );
}
