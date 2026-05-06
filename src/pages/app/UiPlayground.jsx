import React, { useState } from "react";
import { Wallet, Trash2 } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader.jsx";
import Button from "@/components/ui/Button.jsx";
import Input from "@/components/ui/Input.jsx";
import Badge from "@/components/ui/Badge.jsx";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card.jsx";
import AmountDisplay from "@/components/ui/AmountDisplay.jsx";
import BottomSheet from "@/components/ui/BottomSheet.jsx";
import NumPad from "@/components/ui/NumPad.jsx";
import TagsInput from "@/components/ui/TagsInput.jsx";
import RangeBar from "@/components/ui/RangeBar.jsx";
import EmptyState from "@/components/common/EmptyState.jsx";
import { useToast } from "@/components/common/ToastProvider.jsx";

/**
 * UI playground — only mounted in DEV. Documents every reusable
 * primitive so designers can spot regressions and devs can copy-paste.
 */

function Section({ title, children }) {
  return (
    <Card className="space-y-3">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

export default function UiPlayground() {
  const toast = useToast();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pad, setPad] = useState("0");
  const [range, setRange] = useState("month");
  const [tags, setTags] = useState(["food", "travel"]);

  return (
    <div className="page-enter space-y-5">
      <PageHeader title="UI playground" subtitle="Every primitive on one page (DEV only)" />

      <Section title="Buttons">
        <div className="flex flex-wrap gap-2">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="danger">Danger</Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
          <Button size="icon" title="Trash">
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </Section>

      <Section title="Inputs">
        <Input placeholder="Plain input" />
        <Input type="email" placeholder="email@example.com" />
        <Input type="number" placeholder="0.00" step="0.01" />
        <Input type="date" />
      </Section>

      <Section title="AmountDisplay">
        <div className="space-y-1">
          <AmountDisplay cents={420000} currency="UAH" size="xl" />
          <AmountDisplay cents={42000} currency="USD" size="lg" signed />
          <AmountDisplay cents={-15050} currency="EUR" signed />
          <AmountDisplay cents={0} currency="UAH" size="sm" />
        </div>
      </Section>

      <Section title="Badges">
        <div className="flex flex-wrap gap-2">
          <Badge>Default</Badge>
          <Badge variant="solid">Solid</Badge>
          <Badge variant="outline">Outline</Badge>
        </div>
      </Section>

      <Section title="EmptyState">
        <EmptyState icon={Wallet} title="Nothing here" description="Тут поки порожньо. Додай перший запис." />
      </Section>

      <Section title="RangeBar">
        <RangeBar value={range} onChange={setRange} />
        <pre className="text-xs text-slate-500 bg-slate-50 dark:bg-slate-800 rounded-lg p-2 overflow-auto">
          {JSON.stringify(range, null, 2)}
        </pre>
      </Section>

      <Section title="TagsInput">
        <TagsInput value={tags} onChange={setTags} suggestions={["food", "travel", "rent", "tax", "subs"]} />
      </Section>

      <Section title="Toasts">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => toast.push({ kind: "success", title: "Saved", body: "Looking good." })}>
            success
          </Button>
          <Button
            variant="secondary"
            onClick={() => toast.push({ kind: "warning", title: "Heads up", body: "80% spent." })}
          >
            warning
          </Button>
          <Button variant="danger" onClick={() => toast.push({ kind: "error", title: "Couldn't save" })}>
            error
          </Button>
          <Button variant="outline" onClick={() => toast.push({ kind: "info", title: "FYI", body: "Some info." })}>
            info
          </Button>
        </div>
      </Section>

      <Section title="BottomSheet + NumPad">
        <Button onClick={() => setSheetOpen(true)}>Open sheet</Button>
        <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Demo sheet">
          <div className="space-y-3">
            <div className="text-3xl font-bold text-center tabular-nums">{pad}</div>
            <NumPad value={pad} onChange={setPad} onSubmit={() => setSheetOpen(false)} />
          </div>
        </BottomSheet>
      </Section>
    </div>
  );
}
