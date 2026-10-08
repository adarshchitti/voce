"use client";

/**
 * Voce design-system showcase — reference sheet for the redesign.
 *
 * Route: /_design. NOTE the folder on disk is `%5Fdesign`, not `_design`:
 * Next.js App Router treats `_`-prefixed folders as PRIVATE (not routable),
 * and `%5F` is the documented escape for a URL segment starting with `_`.
 *
 * No DB / auth / fetch. Renders whatever the ui/* primitives currently are.
 */

import * as React from "react";

import { Badge, badgeVariants } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const TODAY = "2026-10-05";

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function Section({
  id,
  eyebrow,
  note,
  children,
}: {
  id: string;
  eyebrow: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="border-t-2 border-ink py-[72px] first:border-t-0">
      <h2 className="eyebrow text-ink">{eyebrow}</h2>
      {note && <p className="mt-2 max-w-[68ch] text-[14px] leading-[22px] text-ink-2">{note}</p>}
      <div className="mt-8">{children}</div>
    </section>
  );
}

function Caption({ children }: { children: React.ReactNode }) {
  return <p className="font-mono text-[12px] leading-[18px] text-ink-3">{children}</p>;
}

/** Resolve any CSS colour (incl. oklch / var()) to #rrggbb[aa] via a 1px canvas. */
function toHex(css: string): string {
  try {
    const c = document.createElement("canvas");
    c.width = c.height = 1;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return css;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "#000";
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    const h = (n: number) => n.toString(16).padStart(2, "0");
    const hex = `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
    return a < 255 ? `${hex} @ ${(a / 255).toFixed(2)}a` : hex;
  } catch {
    return css;
  }
}

type Swatch = { name: string; cls: string; authored: string };

function SwatchTile({ s }: { s: Swatch }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [resolved, setResolved] = React.useState<{ css: string; hex: string } | null>(null);

  React.useEffect(() => {
    if (!ref.current) return;
    const css = getComputedStyle(ref.current).backgroundColor;
    setResolved({ css, hex: toHex(css) });
  }, []);

  return (
    <div className="min-w-0">
      <div ref={ref} className={`aspect-square w-full border-2 border-ink ${s.cls}`} />
      <p className="mt-2 font-mono text-[12px] font-medium leading-[16px] text-ink">{s.name}</p>
      <p className="font-mono text-[11px] leading-[16px] text-ink-3">authored: {s.authored}</p>
      <p className="break-all font-mono text-[11px] leading-[16px] text-ink-3">
        resolved: {resolved ? resolved.hex : "..."}
      </p>
      <p className="break-all font-mono text-[11px] leading-[16px] text-ink-3">
        {resolved ? resolved.css : ""}
      </p>
    </div>
  );
}

function SwatchGroup({ label, items, cols }: { label: string; items: Swatch[]; cols: string }) {
  return (
    <div className="mt-10 first:mt-0">
      <p className="eyebrow mb-4 text-ink-2">{label}</p>
      <div className={`grid gap-5 ${cols}`}>
        {items.map((s) => (
          <SwatchTile key={s.name} s={s} />
        ))}
      </div>
    </div>
  );
}

/** A field with a "force focus" link so the focused style can be seen on demand. */
function FocusableField({
  label,
  render,
}: {
  label: string;
  render: (ref: React.RefObject<HTMLInputElement & HTMLTextAreaElement | null>) => React.ReactNode;
}) {
  const ref = React.useRef<(HTMLInputElement & HTMLTextAreaElement) | null>(null);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label>{label}</Label>
        <button
          type="button"
          className="link-rule font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3"
          onClick={() => ref.current?.focus()}
        >
          force focus
        </button>
      </div>
      {render(ref)}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* data                                                                */
/* ------------------------------------------------------------------ */

const SUBSTRATE: Swatch[] = [
  { name: "paper", cls: "bg-paper", authored: "oklch(0.975 0.014 95)" },
  { name: "paper-sunk", cls: "bg-paper-sunk", authored: "oklch(0.955 0.016 95)" },
  { name: "surface", cls: "bg-surface", authored: "#ffffff" },
];
const INK: Swatch[] = [
  { name: "ink", cls: "bg-ink", authored: "oklch(0.19 0.012 95)" },
  { name: "ink-2", cls: "bg-ink-2", authored: "ink @ 0.64" },
  { name: "ink-3", cls: "bg-ink-3", authored: "ink @ 0.48" },
  { name: "hairline", cls: "bg-hairline", authored: "oklch(0.86 0.014 95)" },
];
const ACCENT: Swatch[] = [
  { name: "accent-solid", cls: "bg-accent-solid", authored: "#2563eb" },
  { name: "accent-hover", cls: "bg-accent-hover", authored: "#1d4ed8" },
  { name: "accent-tint", cls: "bg-accent-tint", authored: "#eff4ff" },
];
const PASTELS: Swatch[] = [
  { name: "p-blue", cls: "bg-p-blue", authored: "oklch(0.84 0.13 255)" },
  { name: "p-coral", cls: "bg-p-coral", authored: "oklch(0.84 0.13 40)" },
  { name: "p-lilac", cls: "bg-p-lilac", authored: "oklch(0.84 0.13 300)" },
  { name: "p-sage", cls: "bg-p-sage", authored: "oklch(0.84 0.13 140)" },
];

const SHADOWS = [
  { name: "shadow-card", cls: "shadow-card", spec: "6px 6px 0 ink" },
  { name: "shadow-btn", cls: "shadow-btn", spec: "4px 4px 0 ink" },
  { name: "shadow-nav", cls: "shadow-nav", spec: "3px 3px 0 ink" },
  { name: "shadow-accent", cls: "shadow-accent", spec: "4px 4px 0 accent" },
  { name: "shadow-xs", cls: "shadow-xs", spec: "2px 2px 0 ink" },
];

const BUTTON_VARIANTS = ["default", "destructive", "outline", "secondary", "ghost", "link"] as const;
const BUTTON_SIZES = ["xs", "sm", "default", "lg", "icon-xs", "icon-sm", "icon", "icon-lg"] as const;

const BADGE_VARIANTS = ["default", "secondary", "destructive", "outline", "success", "warning"] as const;
/**
 * `corroborated` / `flagged` / `unverified` are being added by another agent.
 * Cast through the variant prop type so this file builds whether or not they
 * exist yet; `badgeVariants` is then probed at runtime so an undefined variant
 * renders a clearly-marked placeholder instead of a silently unstyled pill.
 */
type BadgeVariant = NonNullable<React.ComponentProps<typeof Badge>["variant"]>;
const NEW_BADGE_VARIANTS = ["corroborated", "flagged", "unverified"] as const;
function badgeVariantExists(v: string): boolean {
  const known = badgeVariants({ variant: v as BadgeVariant });
  const none = badgeVariants({ variant: "__no_such_variant__" as BadgeVariant });
  return known !== none;
}

/* ------------------------------------------------------------------ */
/* page                                                                */
/* ------------------------------------------------------------------ */

export default function DesignSystemPage() {
  return (
    <TooltipProvider>
      <div className="min-h-screen bg-paper text-ink">
        {/* sticky header */}
        <header className="sticky top-0 z-40 border-b-2 border-ink bg-paper">
          <div className="mx-auto flex max-w-[1120px] flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-6 py-4">
            <h1 className="display-2">Voce design system</h1>
            <p className="font-mono text-[12px] text-ink-2">
              token reference · {TODAY} · route /_design
            </p>
          </div>
        </header>

        <main className="mx-auto max-w-[1120px] px-6">
          {/* 1. PALETTE */}
          <Section
            id="palette"
            eyebrow="01 / Palette"
            note="Every colour token on a 2px ink border. Resolved values are read live from the browser (oklch to sRGB hex), so what you see is what the cascade produced."
          >
            <SwatchGroup label="Substrate" items={SUBSTRATE} cols="grid-cols-2 sm:grid-cols-3" />
            <SwatchGroup label="Ink" items={INK} cols="grid-cols-2 sm:grid-cols-4" />
            <SwatchGroup label="Accent" items={ACCENT} cols="grid-cols-2 sm:grid-cols-3" />
            <SwatchGroup
              label="Pastels - one family, identical L 0.84 / C 0.13, hue only"
              items={PASTELS}
              cols="grid-cols-2 sm:grid-cols-4"
            />
            <div className="mt-6 flex h-24 border-2 border-ink">
              <div className="flex-1 bg-p-blue" />
              <div className="flex-1 bg-p-coral" />
              <div className="flex-1 bg-p-lilac" />
              <div className="flex-1 bg-p-sage" />
            </div>
            <div className="mt-2">
              <Caption>pastels butted together, no gaps - they should read as a set</Caption>
            </div>
          </Section>

          {/* 2. TYPE */}
          <Section id="type" eyebrow="02 / Type scale">
            <div className="space-y-10">
              <div>
                <p className="display-xl">Say it like you mean it</p>
                <div className="mt-3">
                  <Caption>.display-xl - Archivo 800 / wdth 125% / clamp(56px, 7.2vw, 104px) / lh 0.92 / ls -0.025em</Caption>
                </div>
              </div>
              <div>
                <p className="display-1">Your voice, verified</p>
                <div className="mt-3">
                  <Caption>.display-1 - Archivo 800 / wdth 125% / clamp(40px, 4.4vw, 64px) / lh 1.0 / ls -0.02em</Caption>
                </div>
              </div>
              <div>
                <p className="display-2">Drafts that sound like you</p>
                <div className="mt-3">
                  <Caption>.display-2 - Archivo 800 / wdth 125% / clamp(32px, 3vw, 44px) / lh 1.04 / ls -0.015em</Caption>
                </div>
              </div>
              <div>
                <p className="display-3">Grounded in what you shipped</p>
                <div className="mt-3">
                  <Caption>.display-3 - Archivo 750 / wdth 112% / 28px / lh 1.12 / ls -0.01em</Caption>
                </div>
              </div>

              <div className="space-y-5 border-t-2 border-hairline pt-8">
                <div>
                  <p className="font-sans text-[20px] leading-[30px]">Body 20 - the quick brown fox jumps over the lazy dog.</p>
                  <Caption>font-sans / 20px / 30px</Caption>
                </div>
                <div>
                  <p className="font-sans text-[16px] leading-[26px]">Body 16 - the quick brown fox jumps over the lazy dog.</p>
                  <Caption>font-sans / 16px / 26px</Caption>
                </div>
                <div>
                  <p className="font-sans text-[14px] leading-[22px]">Body 14 - the quick brown fox jumps over the lazy dog.</p>
                  <Caption>font-sans / 14px / 22px</Caption>
                </div>
                <div>
                  <p className="font-sans text-[13px] leading-[20px]">Body 13 - the quick brown fox jumps over the lazy dog.</p>
                  <Caption>font-sans / 13px / 20px</Caption>
                </div>
                <div>
                  <p className="eyebrow">Eyebrow - mono uppercase label</p>
                  <Caption>.eyebrow - Geist Mono 500 / 12px / ls 0.06em / uppercase</Caption>
                </div>
              </div>

              <div className="border-t-2 border-hairline pt-8">
                <p className="eyebrow mb-4 text-ink-2">font-stretch: 125% proof (both at 36px / 800)</p>
                <div className="space-y-4">
                  <div>
                    <span className="display-2" style={{ fontSize: 36 }}>
                      Wide wordmark WWWW 0123
                    </span>
                    <div>
                      <Caption>.display-2 @ 36px - font-stretch: 125%</Caption>
                    </div>
                  </div>
                  <div>
                    <span
                      className="font-display"
                      style={{ fontSize: 36, fontWeight: 800, lineHeight: 1.04, letterSpacing: "-0.015em" }}
                    >
                      Wide wordmark WWWW 0123
                    </span>
                    <div>
                      <Caption>plain .font-display @ 36px - font-stretch: normal (100%). The line above must be visibly wider.</Caption>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Section>

          {/* 3. SHADOWS */}
          <Section id="shadows" eyebrow="03 / Shadows" note="Hard, zero-blur offsets. No soft shadows exist in this system.">
            <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-5">
              {SHADOWS.map((s) => (
                <div key={s.name}>
                  <div className={`h-28 border-2 border-ink bg-surface ${s.cls}`} />
                  <p className="mt-4 font-mono text-[12px] font-medium">{s.name}</p>
                  <Caption>{s.spec}</Caption>
                </div>
              ))}
            </div>
          </Section>

          {/* 4. PRESS */}
          <Section id="press" eyebrow="04 / Press interaction">
            <p className="mb-8 max-w-[68ch] text-[14px] leading-[22px] text-ink-2">
              Hover each control to see it lift up-left with a longer shadow; mouse down to see it drop down-right
              and flatten. <span className="font-mono">.press</span> = 4px, 6px, 0. <span className="font-mono">.press-card</span> = 6px, 8px, 3px.
            </p>
            <div className="flex flex-wrap items-center gap-6">
              <button type="button" className="press ink-edge cursor-pointer rounded-[10px] bg-accent-solid px-5 py-3 text-[14px] font-semibold text-white">
                Accent
              </button>
              <button type="button" className="press ink-edge cursor-pointer rounded-[10px] bg-surface px-5 py-3 text-[14px] font-semibold text-ink">
                Surface
              </button>
              <button type="button" className="press ink-edge cursor-pointer rounded-[10px] bg-p-coral px-5 py-3 text-[14px] font-semibold text-ink">
                Pastel
              </button>
            </div>
            <div className="mt-10 max-w-sm">
              <div className="press-card ink-edge cursor-pointer rounded-[10px] bg-surface p-5">
                <p className="eyebrow text-ink-2">.press-card</p>
                <p className="display-3 mt-2">Clickable card</p>
                <p className="mt-2 text-[14px] text-ink-2">Hover to lift, click to press in.</p>
              </div>
            </div>
          </Section>

          {/* 5. BUTTONS */}
          <Section
            id="buttons"
            eyebrow="05 / Buttons"
            note="Every variant x every size, read from ui/button.tsx. Rows = variant, columns = size."
          >
            <div className="overflow-x-auto pb-2">
              <table className="border-separate border-spacing-x-4 border-spacing-y-4 text-left">
                <thead>
                  <tr>
                    <th />
                    {BUTTON_SIZES.map((sz) => (
                      <th key={sz} className="eyebrow whitespace-nowrap font-normal text-ink-3">
                        {sz}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {BUTTON_VARIANTS.map((v) => (
                    <tr key={v}>
                      <th className="eyebrow whitespace-nowrap pr-2 text-ink-2">{v}</th>
                      {BUTTON_SIZES.map((sz) => (
                        <td key={sz}>
                          <Button variant={v} size={sz} aria-label={`${v} ${sz}`}>
                            {sz.startsWith("icon") ? "★" : "Button"}
                          </Button>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-6 flex items-center gap-4">
              <Button disabled>Disabled</Button>
              <Caption>disabled state</Caption>
            </div>
          </Section>

          {/* 6. BADGES */}
          <Section id="badges" eyebrow="06 / Badges">
            <div className="flex flex-wrap items-center gap-4">
              {BADGE_VARIANTS.map((v) => (
                <div key={v} className="flex flex-col items-start gap-2">
                  <Badge variant={v}>{v}</Badge>
                  <Caption>{v}</Caption>
                </div>
              ))}
            </div>

            <p className="eyebrow mb-4 mt-10 text-ink-2">Provenance badges (corroborated / flagged / unverified)</p>
            <div className="flex flex-wrap items-center gap-4">
              {NEW_BADGE_VARIANTS.map((v) =>
                badgeVariantExists(v) ? (
                  <div key={v} className="flex flex-col items-start gap-2">
                    <Badge variant={v as BadgeVariant}>{v}</Badge>
                    <Caption>{v}</Caption>
                  </div>
                ) : (
                  /* PLACEHOLDER: variant not defined in ui/badge.tsx yet. Swaps to the real badge automatically once it is. */
                  <div key={v} className="flex flex-col items-start gap-2">
                    <span className="ink-edge-dashed rounded-full px-2 py-0.5 text-[11px] text-ink-3">
                      {v}
                    </span>
                    <Caption>{v} - NOT YET DEFINED in badge.tsx</Caption>
                  </div>
                ),
              )}
            </div>
          </Section>

          {/* 7. FORM CONTROLS */}
          <Section
            id="forms"
            eyebrow="07 / Form controls"
            note="Default state, plus a 'force focus' link to inspect the focused style. Switch / radio / select are buttons, so :focus-visible only shows for keyboard focus - press Tab to reach them."
          >
            <div className="grid gap-10 md:grid-cols-2">
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="in-default">Input - default</Label>
                  <Input id="in-default" placeholder="Placeholder text" />
                </div>
                <FocusableField
                  label="Input - focused"
                  render={(ref) => <Input ref={ref} defaultValue="Focused value" />}
                />
                <div className="space-y-2">
                  <Label htmlFor="in-dis">Input - disabled</Label>
                  <Input id="in-dis" disabled defaultValue="Disabled value" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ta-default">Textarea - default</Label>
                  <Textarea id="ta-default" placeholder="Write something..." />
                </div>
                <FocusableField
                  label="Textarea - focused"
                  render={(ref) => <Textarea ref={ref} defaultValue="Focused textarea" />}
                />
              </div>

              <div className="space-y-8">
                <div className="space-y-3">
                  <p className="eyebrow text-ink-2">Switch</p>
                  <div className="flex items-center gap-3">
                    <Switch id="sw-off" />
                    <Label htmlFor="sw-off">Off (default)</Label>
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch id="sw-on" defaultChecked />
                    <Label htmlFor="sw-on">On</Label>
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch id="sw-dis" disabled />
                    <Label htmlFor="sw-dis">Disabled</Label>
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="eyebrow text-ink-2">Radio group</p>
                  <RadioGroup defaultValue="b">
                    {[
                      ["a", "Specificity"],
                      ["b", "Cadence (selected)"],
                      ["c", "Grounding"],
                    ].map(([val, text]) => (
                      <div key={val} className="flex items-center gap-3">
                        <RadioGroupItem value={val} id={`rg-${val}`} />
                        <Label htmlFor={`rg-${val}`}>{text}</Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>

                <div className="space-y-3">
                  <p className="eyebrow text-ink-2">Select</p>
                  <div className="flex flex-wrap items-center gap-4">
                    <Select defaultValue="pro">
                      <SelectTrigger className="w-48" aria-label="Tone">
                        <SelectValue placeholder="Pick a tone" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pro">Professional</SelectItem>
                        <SelectItem value="warm">Warm</SelectItem>
                        <SelectItem value="blunt">Blunt</SelectItem>
                      </SelectContent>
                    </Select>
                    <Caption>click to open the listbox; Tab to see focus ring</Caption>
                  </div>
                </div>
              </div>
            </div>
          </Section>

          {/* 8. SURFACES */}
          <Section id="surfaces" eyebrow="08 / Surfaces">
            <div className="grid gap-10 md:grid-cols-2">
              <div>
                <p className="eyebrow mb-4 text-ink-2">Card - header / content / footer</p>
                <Card>
                  <CardHeader>
                    <CardTitle>Draft quality</CardTitle>
                    <Badge variant="success">passed</Badge>
                  </CardHeader>
                  <CardDescription>Coherence, AI-tells and stance consistency all cleared the gate.</CardDescription>
                  {/* content + footer are composed from plain divs: card.tsx has no CardContent/CardFooter export yet */}
                  <div className="mt-4 text-[14px] leading-[22px]">
                    Shipped the ingestion rewrite last quarter and cut p95 latency by 38%.
                  </div>
                  <div className="mt-4 flex items-center justify-end gap-2 border-t-2 border-hairline pt-4">
                    <Button variant="ghost" size="sm">Reject</Button>
                    <Button size="sm">Approve</Button>
                  </div>
                </Card>
              </div>

              <div className="space-y-8">
                <div>
                  <p className="eyebrow mb-4 text-ink-2">Popover</p>
                  <Popover>
                    <PopoverTrigger className={buttonVariants({ variant: "outline" })}>
                      Open popover
                    </PopoverTrigger>
                    <PopoverContent>
                      <p className="text-[14px] font-medium">Popover content</p>
                      <p className="mt-1 text-[13px] text-ink-2">Anchored, dismissible, portal-rendered.</p>
                    </PopoverContent>
                  </Popover>
                </div>

                <div>
                  <p className="eyebrow mb-4 text-ink-2">Tooltip</p>
                  <Tooltip>
                    <TooltipTrigger className={buttonVariants({ variant: "outline" })}>
                      Hover me
                    </TooltipTrigger>
                    <TooltipContent>Tooltip text</TooltipContent>
                  </Tooltip>
                </div>

                <div>
                  <p className="eyebrow mb-4 text-ink-2">Sheet</p>
                  <Sheet>
                    <SheetTrigger className={buttonVariants({ variant: "outline" })}>
                      Open sheet
                    </SheetTrigger>
                    <SheetContent side="right">
                      <SheetHeader>
                        <SheetTitle>Sheet title</SheetTitle>
                        <SheetDescription>Side panel for secondary flows.</SheetDescription>
                      </SheetHeader>
                    </SheetContent>
                  </Sheet>
                </div>
              </div>

              <div>
                <p className="eyebrow mb-4 text-ink-2">Tabs - default and line</p>
                <Tabs defaultValue="one">
                  <TabsList>
                    <TabsTrigger value="one">Voice</TabsTrigger>
                    <TabsTrigger value="two">Topics</TabsTrigger>
                    <TabsTrigger value="three">History</TabsTrigger>
                  </TabsList>
                  <TabsContent value="one" className="pt-3 text-[14px]">Voice panel content.</TabsContent>
                  <TabsContent value="two" className="pt-3 text-[14px]">Topics panel content.</TabsContent>
                  <TabsContent value="three" className="pt-3 text-[14px]">History panel content.</TabsContent>
                </Tabs>
                <div className="mt-8">
                  <Tabs defaultValue="one">
                    <TabsList variant="line">
                      <TabsTrigger value="one">Voice</TabsTrigger>
                      <TabsTrigger value="two">Topics</TabsTrigger>
                    </TabsList>
                    <TabsContent value="one" className="pt-3 text-[14px]">Line-variant panel.</TabsContent>
                    <TabsContent value="two" className="pt-3 text-[14px]">Second line panel.</TabsContent>
                  </Tabs>
                </div>
              </div>

              <div>
                <p className="eyebrow mb-4 text-ink-2">Skeleton</p>
                <div className="space-y-3">
                  <Skeleton className="h-6 w-2/3" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-5/6" />
                  <Skeleton className="h-24 w-full" />
                </div>
              </div>
            </div>
          </Section>

          {/* 9. BORDER SEMANTICS */}
          <Section
            id="borders"
            eyebrow="09 / Border semantics"
            note="Convention: solid ink = real, verified, structural. Dashed ink = placeholder, unverified, not yet true."
          >
            <div className="grid gap-8 sm:grid-cols-2">
              <div className="ink-edge rounded-[10px] bg-surface p-6">
                <p className="eyebrow">verified / structural</p>
                <p className="display-3 mt-3">Solid 2px ink</p>
                <p className="mt-2 text-[14px] text-ink-2">.ink-edge - a claim backed by a public artifact.</p>
              </div>
              <div className="ink-edge-dashed rounded-[10px] bg-surface p-6">
                <p className="eyebrow">unverified / placeholder</p>
                <p className="display-3 mt-3">Dashed 2px ink</p>
                <p className="mt-2 text-[14px] text-ink-2">.ink-edge-dashed - a claim with no source yet.</p>
              </div>
            </div>
          </Section>

          <div className="pb-[72px]">
            <Caption>end of reference sheet</Caption>
          </div>
        </main>
      </div>
    </TooltipProvider>
  );
}
