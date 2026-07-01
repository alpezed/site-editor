"use client";

import { useMemo, useState } from "react";
import {
  Plus,
  X,
  GripVertical,
  ChevronRight,
  Square,
  Type,
  Heading,
  MousePointerClick,
  Image as ImageIcon,
  Layers as LayersIcon,
  Box,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CATEGORIES, SECTIONS, getSection } from "@/lib/sections/catalog";
import type { SectionInstance, TreeNode } from "@/lib/editor/types";
import { cn } from "@/lib/utils";

type Tab = "add" | "layers";

export function LeftPanel(props: {
  tab: Tab;
  onClose: () => void;
  sections: SectionInstance[];
  tree: TreeNode[];
  selectedSxId: string | null;
  onAdd: (name: string) => void;
  onSelect: (sxId: string) => void;
  onReorderSections: (orderedKeys: string[]) => void;
}) {
  const { tab } = props;
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-3">
        <h2 className="text-base font-semibold text-white">
          {tab === "add" ? "Add Elements" : "Layers"}
        </h2>
        <button
          onClick={props.onClose}
          title="Close panel"
          className="rounded-md p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "add" ? (
          <AddTab onAdd={props.onAdd} />
        ) : (
          <LayersTab
            sections={props.sections}
            tree={props.tree}
            selectedSxId={props.selectedSxId}
            onSelect={props.onSelect}
            onReorderSections={props.onReorderSections}
          />
        )}
      </div>
    </div>
  );
}

const ICONS: Record<string, typeof Box> = {
  BlankSection: Box,
  Container: Square,
  Heading: Heading,
  TextBlock: Type,
  ButtonBlock: MousePointerClick,
  ImageBlock: ImageIcon,
};

function AddTab({ onAdd }: { onAdd: (name: string) => void }) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const cats = useMemo(
    () =>
      CATEGORIES.map((c) => ({
        name: c,
        items: SECTIONS.filter(
          (s) =>
            s.category === c &&
            (!query ||
              s.label.toLowerCase().includes(query) ||
              s.name.toLowerCase().includes(query)),
        ),
      })).filter((c) => c.items.length > 0),
    [query],
  );

  return (
    <div className="p-3">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search elements"
        className="mb-3 h-8 w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-500 focus:outline-none"
      />
      {cats.map((c) => (
        <Collapsible key={c.name} title={c.name} defaultOpen={c.name === "Basic Elements" || Boolean(query)}>
          <div className="grid grid-cols-1 gap-1">
            {c.items.map((s) => {
              const Icon = ICONS[s.name] ?? Box;
              return (
                <button
                  key={s.name}
                  onClick={() => onAdd(s.name)}
                  className="group flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-2 text-left text-sm text-zinc-300 hover:border-zinc-600 hover:text-white"
                >
                  <Icon className="size-4 text-zinc-500 group-hover:text-zinc-300" />
                  <span className="flex-1 truncate">{s.label}</span>
                  <Plus className="size-3.5 text-zinc-600 group-hover:text-zinc-300" />
                </button>
              );
            })}
          </div>
        </Collapsible>
      ))}
    </div>
  );
}

function LayersTab(props: {
  sections: SectionInstance[];
  tree: TreeNode[];
  selectedSxId: string | null;
  onSelect: (sxId: string) => void;
  onReorderSections: (orderedKeys: string[]) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const keys = props.sections.map((s) => s.key);

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = keys.indexOf(String(active.id));
    const to = keys.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    props.onReorderSections(arrayMove(keys, from, to));
  }

  return (
    <div className="p-2 text-sm">
      {props.sections.length > 0 && (
        <>
          <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Sections — drag to reorder
          </p>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={keys} strategy={verticalListSortingStrategy}>
              {props.sections.map((s) => (
                <SortableSection key={s.key} id={s.key} name={getSection(s.name)?.label ?? s.name} />
              ))}
            </SortableContext>
          </DndContext>
          <div className="my-2 border-t border-zinc-800" />
        </>
      )}
      <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Page tree
      </p>
      {props.tree.length === 0 ? (
        <p className="px-2 py-3 text-xs text-zinc-500">
          Enable Edit mode and the page structure shows here.
        </p>
      ) : (
        props.tree.map((n, i) => (
          <TreeRow
            key={i}
            node={n}
            depth={0}
            selectedSxId={props.selectedSxId}
            onSelect={props.onSelect}
          />
        ))
      )}
    </div>
  );
}

function SortableSection({ id, name }: { id: string; name: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "mb-1 flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-zinc-200",
        isDragging && "opacity-60",
      )}
      {...attributes}
      {...listeners}
    >
      <GripVertical className="size-4 cursor-grab text-zinc-500" />
      <span className="flex-1 truncate">{name}</span>
    </div>
  );
}

function TreeRow({
  node,
  depth,
  selectedSxId,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  selectedSxId: string | null;
  onSelect: (sxId: string) => void;
}) {
  const [open, setOpen] = useState(depth < 1);
  const hasChildren = node.children.length > 0;
  const selected = node.sxId && node.sxId === selectedSxId;
  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1 rounded px-1 py-1 hover:bg-zinc-800",
          selected && "bg-zinc-800",
        )}
        style={{ paddingLeft: depth * 12 + 4 }}
      >
        {hasChildren ? (
          <button onClick={() => setOpen((v) => !v)} className="text-zinc-500">
            <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
          </button>
        ) : (
          <span className="w-3.5" />
        )}
        <button
          onClick={() => node.sxId && onSelect(node.sxId)}
          className="flex flex-1 items-center gap-1.5 truncate text-left text-zinc-300 hover:text-white"
        >
          <LayersIcon className="size-3.5 shrink-0 text-zinc-600" />
          <span className="truncate">{node.name}</span>
          <span className="text-[10px] text-zinc-600">{node.tag}</span>
        </button>
      </div>
      {open &&
        node.children.map((c, i) => (
          <TreeRow
            key={i}
            node={c}
            depth={depth + 1}
            selectedSxId={selectedSxId}
            onSelect={onSelect}
          />
        ))}
    </div>
  );
}

function Collapsible({
  title,
  defaultOpen,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  return (
    <div className="mb-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1 px-1 py-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400 hover:text-zinc-200"
      >
        <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
        {title}
      </button>
      {open && <div className="mt-1">{children}</div>}
    </div>
  );
}

