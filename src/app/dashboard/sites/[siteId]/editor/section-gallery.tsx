"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { CATEGORIES, SECTIONS } from "@/lib/sections/catalog";
import { cn } from "@/lib/utils";

export function SectionGallery({
  onAdd,
}: {
  onAdd: (name: string) => void;
}) {
  const [category, setCategory] = useState<string>(CATEGORIES[0]);

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of SECTIONS) m[s.category] = (m[s.category] ?? 0) + 1;
    return m;
  }, []);

  const visible = SECTIONS.filter((s) => s.category === category);

  return (
    <div className="h-full overflow-y-auto bg-zinc-950 px-8 py-6 text-zinc-100">
      <h1 className="text-2xl font-bold">Section Gallery</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Click any section to drop it straight into your site.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm transition-colors",
              category === c
                ? "border-orange-500 text-orange-400"
                : "border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200",
            )}
          >
            {c}
            {counts[c] ? (
              <span className="ml-1.5 text-xs text-zinc-600">{counts[c]}</span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="mt-6 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">{category}</h2>
        <span className="text-xs text-zinc-500">{visible.length} options</span>
      </div>

      {visible.length === 0 ? (
        <p className="mt-10 text-center text-sm text-zinc-500">
          No sections in this category yet.
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((s) => {
            return (
              <div
                key={s.name}
                className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900"
              >
                <div
                  className="flex aspect-[16/9] items-center justify-center bg-cover bg-center p-4 text-center"
                  style={
                    s.thumb
                      ? { backgroundImage: `url(${s.thumb})` }
                      : {
                          background:
                            "linear-gradient(135deg,#1e293b,#312e81)",
                        }
                  }
                >
                  {!s.thumb && (
                    <span className="text-sm font-semibold text-zinc-300">
                      {s.label}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 px-4 py-3">
                  <span className="truncate text-sm font-medium">{s.label}</span>
                  <button
                    onClick={() => onAdd(s.name)}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:bg-zinc-700"
                  >
                    <Plus className="size-3.5" />
                    Add to Site
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
