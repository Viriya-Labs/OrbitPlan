"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import type { ExecutionDestination } from "@/types/execution";

type ExecutionDestinationOption = {
  id: ExecutionDestination;
  title: string;
  detail: string;
};

type ExecutionHubModalProps = {
  open: boolean;
  activeDestination: ExecutionDestination;
  destinationOptions: ExecutionDestinationOption[];
  selectedDestinationTitle: string;
  selectedDestinationDetail: string;
  selectedSections: string[];
  onClose: () => void;
  onSelectDestination: (destination: ExecutionDestination) => void;
  children: ReactNode;
};

export function ExecutionHubModal({
  open,
  activeDestination,
  destinationOptions,
  selectedDestinationTitle,
  selectedDestinationDetail,
  selectedSections,
  onClose,
  onSelectDestination,
  children,
}: ExecutionHubModalProps) {
  if (!open) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(2,4,12,0.72)] p-4 backdrop-blur-md"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="max-h-[88vh] w-full max-w-7xl overflow-auto rounded-[28px] border border-[rgba(120,145,255,0.3)] bg-[rgba(5,9,24,0.96)] p-5 shadow-[0_28px_80px_-36px_rgba(0,0,0,0.95)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Step 4</p>
            <h2 className="mt-1 text-2xl font-semibold text-[var(--text-primary)]">Execution Hub</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Choose a destination on the left, then configure how OrbitPlan should deliver the action plan.
            </p>
          </div>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="grid gap-5 xl:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="rounded-[24px] border border-[rgba(120,145,255,0.18)] bg-[rgba(255,255,255,0.03)] p-3">
            <div className="space-y-2">
              {destinationOptions.map((option) => {
                const isSelected = activeDestination === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => onSelectDestination(option.id)}
                    className={`w-full rounded-2xl border p-3 text-left transition ${
                      isSelected
                        ? "border-[rgba(108,242,255,0.34)] bg-[rgba(108,242,255,0.12)] shadow-[0_18px_34px_-28px_rgba(108,242,255,0.8)]"
                        : "border-[rgba(120,145,255,0.18)] bg-[rgba(255,255,255,0.03)] hover:border-[rgba(120,145,255,0.34)]"
                    }`}
                  >
                    <p className="text-sm font-semibold text-[var(--text-primary)]">{option.title}</p>
                    <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{option.detail}</p>
                    <span
                      className={`mt-3 inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${
                        isSelected
                          ? "border-[rgba(56,255,179,0.34)] bg-[rgba(56,255,179,0.14)] text-[var(--success)]"
                          : "border-[rgba(120,145,255,0.2)] bg-[rgba(255,255,255,0.04)] text-[var(--text-muted)]"
                      }`}
                    >
                      {isSelected ? "Active" : "Select"}
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          <div className="space-y-4">
            <div className="rounded-[24px] border border-[rgba(120,145,255,0.18)] bg-[linear-gradient(135deg,rgba(30,123,255,0.12)_0%,rgba(143,56,255,0.08)_58%,rgba(255,180,0,0.05)_100%)] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Selected Destination</p>
                  <p className="mt-2 text-xl font-semibold text-[var(--text-primary)]">{selectedDestinationTitle}</p>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">{selectedDestinationDetail}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedSections.map((section) => (
                    <span
                      key={section}
                      className="rounded-full border border-[rgba(120,145,255,0.2)] bg-[rgba(255,255,255,0.04)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]"
                    >
                      {section}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {children}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
