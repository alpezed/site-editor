"use client";

import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
} from "lucide-react";
import type { Selection } from "@/lib/editor/types";
import type { Patch } from "@/lib/editor/node-edit";
import { tokenFor, readValue, type TwGroup } from "@/lib/editor/tailwind";
import {
  ColorField,
  Group,
  NumberUnit,
  Row,
  SelectField,
  Segmented,
  TextField,
} from "./inspector-controls";

export function RightInspector({
  selection,
  onPatch,
}: {
  selection: Selection | null;
  onPatch: (patch: Patch) => void;
}) {
  if (!selection) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-zinc-500">
        Select an element in the canvas to edit its styles.
      </div>
    );
  }

  const cls = selection.classes;
  const read = (g: TwGroup) => readValue(cls, g);
  // Set a Tailwind class group (null clears it).
  const setClass = (group: TwGroup, value: string | null) =>
    onPatch({ kind: "classes", group, token: tokenFor(group, value) });

  const dynamic = !selection.sxId; // component root / unstamped — can't node-edit
  const isFlex = read("display") === "flex" || read("display") === "inline-flex";

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="border-b border-zinc-800 px-4 py-3">
        <p className="truncate text-sm font-semibold text-white">
          {selection.name}
        </p>
        <p className="text-xs text-zinc-500">{`<${selection.tag}>`}</p>
        {dynamic && (
          <p className="mt-1 text-[11px] text-amber-400">
            Style edits unavailable for this element (no source anchor).
          </p>
        )}
      </div>

      {/* Content: text + common attributes */}
      {(selection.text != null || selection.tag === "a" || selection.tag === "img") && (
        <Group title="Content">
          {selection.text != null && (
            <Row label="Text">
              <TextField
                value={selection.text}
                onCommit={(v) => onPatch({ kind: "text", value: v })}
              />
            </Row>
          )}
          {selection.tag === "a" && (
            <Row label="Link">
              <TextField
                value=""
                placeholder="https://…"
                onCommit={(v) => onPatch({ kind: "attr", name: "href", value: v })}
              />
            </Row>
          )}
          {selection.tag === "img" && (
            <Row label="Source">
              <TextField
                value=""
                placeholder="/image.png"
                onCommit={(v) => onPatch({ kind: "attr", name: "src", value: v })}
              />
            </Row>
          )}
        </Group>
      )}

      <fieldset disabled={dynamic} className="contents">
        <Group title="Layout">
          <Row label="Display">
            <Segmented
              value={read("display")}
              onChange={(v) => setClass("display", v)}
              options={[
                { value: "block", label: "Block" },
                { value: "flex", label: "Flex" },
                { value: "grid", label: "Grid" },
                { value: "hidden", label: "None" },
              ]}
            />
          </Row>
          {isFlex && (
            <>
              <Row label="Direction">
                <Segmented
                  value={read("flexDirection")}
                  onChange={(v) => setClass("flexDirection", v)}
                  options={[
                    { value: "row", label: "Row" },
                    { value: "col", label: "Column" },
                  ]}
                />
              </Row>
              <Row label="Align">
                <Segmented
                  value={read("align")}
                  onChange={(v) => setClass("align", v)}
                  options={[
                    { value: "start", label: "Start" },
                    { value: "center", label: "Center" },
                    { value: "end", label: "End" },
                  ]}
                />
              </Row>
              <Row label="Justify">
                <Segmented
                  value={read("justify")}
                  onChange={(v) => setClass("justify", v)}
                  options={[
                    { value: "start", label: "Start" },
                    { value: "center", label: "Center" },
                    { value: "between", label: "Between" },
                  ]}
                />
              </Row>
            </>
          )}
          <Row label="Gap">
            <NumberUnit unit="" value={read("gap")} onCommit={(v) => setClass("gap", v)} />
          </Row>
        </Group>

        <Group title="Spacing">
          <Row label="Padding">
            <NumberUnit unit="" value={read("padding")} onCommit={(v) => setClass("padding", v)} />
          </Row>
          <Row label="Margin">
            <NumberUnit unit="" value={read("margin")} onCommit={(v) => setClass("margin", v)} />
          </Row>
        </Group>

        <Group title="Size">
          <Row label="Width">
            <TextField value={read("width")} placeholder="100% / 320px" onCommit={(v) => setClass("width", v)} />
          </Row>
          <Row label="Max W">
            <TextField value={read("maxWidth")} placeholder="1200px" onCommit={(v) => setClass("maxWidth", v)} />
          </Row>
        </Group>

        <Group title="Typography">
          <Row label="Size">
            <NumberUnit value={read("fontSize")} onCommit={(v) => setClass("fontSize", v)} />
          </Row>
          <Row label="Weight">
            <SelectField
              value={read("fontWeight") || "normal"}
              onChange={(v) => setClass("fontWeight", v)}
              options={[
                { value: "normal", label: "Regular" },
                { value: "medium", label: "Medium" },
                { value: "semibold", label: "Semibold" },
                { value: "bold", label: "Bold" },
              ]}
            />
          </Row>
          <Row label="Align">
            <Segmented
              value={read("textAlign")}
              onChange={(v) => setClass("textAlign", v)}
              options={[
                { value: "left", label: <AlignLeft className="size-3.5" />, title: "Left" },
                { value: "center", label: <AlignCenter className="size-3.5" />, title: "Center" },
                { value: "right", label: <AlignRight className="size-3.5" />, title: "Right" },
                { value: "justify", label: <AlignJustify className="size-3.5" />, title: "Justify" },
              ]}
            />
          </Row>
          <Row label="Color">
            <ColorField value={read("textColor")} onCommit={(v) => setClass("textColor", v)} />
          </Row>
        </Group>

        <Group title="Effect">
          <Row label="Background">
            <ColorField value={read("bgColor")} onCommit={(v) => setClass("bgColor", v)} />
          </Row>
          <Row label="Radius">
            <NumberUnit value={read("rounded")} onCommit={(v) => setClass("rounded", v)} />
          </Row>
          <Row label="Shadow">
            <SelectField
              value={read("shadow") || "none"}
              onChange={(v) => setClass("shadow", v)}
              options={[
                { value: "none", label: "None" },
                { value: "sm", label: "Small" },
                { value: "md", label: "Medium" },
                { value: "lg", label: "Large" },
                { value: "xl", label: "Extra large" },
              ]}
            />
          </Row>
          <Row label="Opacity">
            <NumberUnit unit="%" value={read("opacity")} onCommit={(v) => setClass("opacity", v)} />
          </Row>
        </Group>
      </fieldset>
    </div>
  );
}
