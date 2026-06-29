"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** Collapsible inspector group, e.g. "Layout", "Spacing". */
export function Group({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-zinc-800">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-300 hover:text-white"
      >
        {title}
        <ChevronDown
          className={cn("size-4 transition-transform", open && "rotate-180")}
        />
      </button>
      {open && <div className="space-y-3 px-4 pb-4">{children}</div>}
    </div>
  );
}

/** Labelled control row. */
export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-xs text-zinc-400">{label}</span>
      <div className="flex min-w-0 flex-1 items-center gap-1.5">{children}</div>
    </div>
  );
}

const inputCls =
  "h-8 w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-500 focus:outline-none";

/** Number + unit input. Emits the raw value string (e.g. "24") on commit. */
export function NumberUnit({
  value,
  unit = "px",
  placeholder,
  onCommit,
}: {
  value: string;
  unit?: string;
  placeholder?: string;
  onCommit: (v: string) => void;
}) {
  const [local, setLocal] = useState(value);
  return (
    <div className="flex flex-1 items-center rounded-md border border-zinc-700 bg-zinc-900 focus-within:border-zinc-500">
      <input
        value={local}
        placeholder={placeholder}
        inputMode="decimal"
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => local !== value && onCommit(local)}
        onKeyDown={(e) => e.key === "Enter" && onCommit(local)}
        className="h-8 w-full bg-transparent px-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
      />
      <span className="px-2 text-xs text-zinc-500">{unit}</span>
    </div>
  );
}

/** Plain text input committed on blur/enter. */
export function TextField({
  value,
  placeholder,
  onCommit,
}: {
  value: string;
  placeholder?: string;
  onCommit: (v: string) => void;
}) {
  const [local, setLocal] = useState(value);
  return (
    <input
      value={local}
      placeholder={placeholder}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => local !== value && onCommit(local)}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      className={inputCls}
    />
  );
}

/** Segmented button group (alignment, direction…). */
export function Segmented({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: ReactNode; title?: string }[];
  value: string | null;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-1 overflow-hidden rounded-md border border-zinc-700">
      {options.map((o) => (
        <button
          key={o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex h-8 flex-1 items-center justify-center text-xs",
            value === o.value
              ? "bg-zinc-700 text-white"
              : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Native select. */
export function SelectField({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={inputCls}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Color swatch (native picker) + hex field. */
export function ColorField({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (hex: string) => void;
}) {
  const hex = /^#[0-9a-fA-F]{3,8}$/.test(value) ? value : "#000000";
  const [local, setLocal] = useState(value);
  return (
    <div className="flex flex-1 items-center gap-1.5">
      <label className="relative size-8 shrink-0 cursor-pointer overflow-hidden rounded-md border border-zinc-700">
        <span className="block size-full" style={{ background: hex }} />
        <input
          type="color"
          value={hex}
          onChange={(e) => {
            setLocal(e.target.value);
            onCommit(e.target.value);
          }}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
      <input
        value={local}
        placeholder="#000000"
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => local !== value && onCommit(local)}
        onKeyDown={(e) => e.key === "Enter" && onCommit(local)}
        className={inputCls}
      />
    </div>
  );
}
