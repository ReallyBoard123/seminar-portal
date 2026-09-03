"use client";

import { Children } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type SwitchTab = {
  key: string;
  label: string;
  /** Short status word rendered after the name ("submitted", "needed"). */
  hint?: string;
};

/**
 * shadcn Tabs over a set of panels, for sections where two long cards would
 * otherwise stack into a scroll ("Reviews you owe" with two assignments).
 * `keepMounted` matters: a half-typed review form must survive switching
 * away and back. With one panel the bar disappears and this is just a
 * wrapper.
 */
export function SwitchTabs({ items, children }: { items: SwitchTab[]; children: React.ReactNode }) {
  const panels = Children.toArray(children);

  if (items.length <= 1) return <>{children}</>;

  return (
    <Tabs defaultValue={items[0]?.key}>
      <TabsList>
        {items.map((item) => (
          <TabsTrigger key={item.key} value={item.key}>
            {item.label}
            {item.hint && <span className="text-muted-foreground ml-1 text-[11px]">· {item.hint}</span>}
          </TabsTrigger>
        ))}
      </TabsList>
      {items.map((item, i) => (
        <TabsContent key={item.key} value={item.key} keepMounted>
          {panels[i]}
        </TabsContent>
      ))}
    </Tabs>
  );
}
