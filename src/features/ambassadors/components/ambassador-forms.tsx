"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fieldClass, FormMessages } from "@/features/training/components/staff/staff-forms";
import {
  applyAsAmbassadorAction,
  decideAmbassadorAction,
  issueAmbassadorCertificateAction,
  payViaRazorpayXAction,
  recordManualPayoutAction,
  saveUpiIdAction,
} from "../actions";

type ActionResult = { success: true } | { success: false; error: string };

function useAction() {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const run = (action: () => Promise<ActionResult>, doneNotice?: string) => {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await action();
      if (!result.success) {
        setError(result.error);
        return;
      }
      if (doneNotice) setNotice(doneNotice);
      router.refresh();
    });
  };
  return { error, notice, pending, run };
}

function TextArea({ label, value, onChange, required, maxLength }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; maxLength: number }) {
  const id = React.useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-semibold">
        {label}
      </label>
      <textarea id={id} rows={3} required={required} maxLength={maxLength} className={fieldClass} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

/** College field: suggestions from the college master; a typed name is added for review. */
function CollegeField({ value, onChange }: { value: { id: string | null; name: string }; onChange: (value: { id: string | null; name: string }) => void }) {
  const [suggestions, setSuggestions] = React.useState<Array<{ id: string; name: string }>>([]);
  const listId = React.useId();
  React.useEffect(() => {
    const query = value.name.trim();
    if (query.length < 2 || value.id) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/colleges?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then((response) => (response.ok ? response.json() : { colleges: [] }))
        .then((data: { colleges?: Array<{ id: string; name: string }> }) => setSuggestions(data.colleges ?? []))
        .catch(() => undefined);
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [value]);
  return (
    <div className="space-y-1">
      <Input
        label="College *"
        list={listId}
        value={value.name}
        required
        maxLength={200}
        autoComplete="off"
        onChange={(event) => {
          const name = event.target.value;
          const match = suggestions.find((college) => college.name === name);
          onChange({ id: match?.id ?? null, name });
        }}
      />
      <datalist id={listId}>
        {suggestions.map((college) => (
          <option key={college.id} value={college.name} />
        ))}
      </datalist>
      <p className="text-xs text-muted-foreground">Pick your college from the suggestions, or type its full name.</p>
    </div>
  );
}

export function AmbassadorApplyForm() {
  const router = useRouter();
  const [values, setValues] = React.useState({ phone: "", branch: "", yearOfStudy: "", motivation: "", socialReach: "", pastExperience: "" });
  const [college, setCollege] = React.useState<{ id: string | null; name: string }>({ id: null, name: "" });
  const [consent, setConsent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const yearId = React.useId();
  const set = (key: keyof typeof values) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setValues({ ...values, [key]: event.target.value });
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await applyAsAmbassadorAction({
        ...values,
        collegeId: college.id ?? "",
        collegeName: college.id ? "" : college.name,
        consent,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Input label="Mobile number *" type="tel" inputMode="tel" value={values.phone} onChange={set("phone")} required maxLength={16} placeholder="98765 43210" />
        <CollegeField value={college} onChange={setCollege} />
        <Input label="Branch" value={values.branch} onChange={set("branch")} maxLength={120} placeholder="e.g. Computer Science" />
        <div className="space-y-1.5">
          <label htmlFor={yearId} className="block text-xs font-semibold">
            Year of study
          </label>
          <select id={yearId} className={`${fieldClass} h-10`} value={values.yearOfStudy} onChange={set("yearOfStudy")}>
            <option value="">Choose</option>
            {[1, 2, 3, 4, 5, 6].map((year) => (
              <option key={year} value={year}>
                Year {year}
              </option>
            ))}
          </select>
        </div>
      </div>
      <TextArea label="Why do you want to be a Campus Ambassador? *" value={values.motivation} onChange={(motivation) => setValues({ ...values, motivation })} required maxLength={2000} />
      <TextArea label="Communities and reach (clubs, groups, social media)" value={values.socialReach} onChange={(socialReach) => setValues({ ...values, socialReach })} maxLength={1000} />
      <TextArea label="Past experience (events, ambassador roles)" value={values.pastExperience} onChange={(pastExperience) => setValues({ ...values, pastExperience })} maxLength={1000} />
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-input" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
        <span>
          I have read and agree to the{" "}
          <Link href="/privacy" target="_blank" className="font-medium text-primary underline underline-offset-4">
            Privacy Policy
          </Link>
          , the{" "}
          <Link href="/terms" target="_blank" className="font-medium text-primary underline underline-offset-4">
            Terms of Service
          </Link>{" "}
          and the{" "}
          <Link href="/campus-ambassador" target="_blank" className="font-medium text-primary underline underline-offset-4">
            ambassador rules
          </Link>
          .
        </span>
      </label>
      <FormMessages error={error} />
      <Button type="submit" disabled={pending || !consent}>
        {pending ? "Sending…" : "Send application"}
      </Button>
    </form>
  );
}

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => {
        navigator.clipboard
          .writeText(value)
          .then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
          })
          .catch(() => undefined);
      }}
    >
      {copied ? "Copied" : label}
    </Button>
  );
}

export function UpiForm({ masked }: { masked: string | null }) {
  const [upiId, setUpiId] = React.useState("");
  const { error, notice, pending, run } = useAction();
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        run(() => saveUpiIdAction({ upiId }), "UPI ID saved.");
        setUpiId("");
      }}
      className="space-y-2"
    >
      <p className="text-sm">{masked ? `Payouts go to ${masked}.` : "Add your UPI ID to receive payouts."}</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Input label={masked ? "Change UPI ID" : "UPI ID"} value={upiId} onChange={(event) => setUpiId(event.target.value)} placeholder="name@bank" maxLength={320} required />
        </div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Stored encrypted; only payouts use it.</p>
      <FormMessages error={error} notice={notice} />
    </form>
  );
}

// ----------------------------------------------------------------------------- staff

export function AmbassadorDecisionForm({ ambassadorId, status }: { ambassadorId: string; status: string }) {
  const [role, setRole] = React.useState<"LEAD" | "ASSOCIATE">("ASSOCIATE");
  const [note, setNote] = React.useState("");
  const { error, pending, run } = useAction();
  const roleId = React.useId();
  const canApprove = status === "PENDING" || status === "DEACTIVATED";
  return (
    <div className="space-y-2">
      {canApprove && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="space-y-1.5">
            <label htmlFor={roleId} className="block text-xs font-semibold">
              Role
            </label>
            <select id={roleId} className={`${fieldClass} h-9`} value={role} onChange={(event) => setRole(event.target.value as "LEAD" | "ASSOCIATE")}>
              <option value="ASSOCIATE">Associate</option>
              <option value="LEAD">Lead (one per college)</option>
            </select>
          </div>
          <Button size="sm" disabled={pending} onClick={() => run(() => decideAmbassadorAction({ ambassadorId, decision: "APPROVE", role }))}>
            {status === "DEACTIVATED" ? "Reactivate" : "Approve"}
          </Button>
        </div>
      )}
      {(status === "PENDING" || status === "APPROVED") && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Input label="Reason (required to reject or deactivate)" value={note} maxLength={1000} onChange={(event) => setNote(event.target.value)} />
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={pending || note.trim().length < 5}
            onClick={() => run(() => decideAmbassadorAction({ ambassadorId, decision: status === "PENDING" ? "REJECT" : "DEACTIVATE", note }))}
          >
            {status === "PENDING" ? "Reject" : "Deactivate"}
          </Button>
        </div>
      )}
      <FormMessages error={error} />
    </div>
  );
}

export function AmbassadorCertificateForm({ ambassadorId, defaults }: { ambassadorId: string; defaults: { name: string; title: string; periodEnd: string } }) {
  const [values, setValues] = React.useState({ signatoryName: defaults.name, signatoryTitle: defaults.title, periodEnd: defaults.periodEnd });
  const { error, notice, pending, run } = useAction();
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        run(() => issueAmbassadorCertificateAction({ ambassadorId, ...values }), "Certificate issued.");
      }}
      className="space-y-2"
    >
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <Input label="Last day of the role" type="date" value={values.periodEnd} onChange={(event) => setValues({ ...values, periodEnd: event.target.value })} required />
        <Input label="Signatory name" value={values.signatoryName} onChange={(event) => setValues({ ...values, signatoryName: event.target.value })} required maxLength={120} />
        <Input label="Signatory title" value={values.signatoryTitle} onChange={(event) => setValues({ ...values, signatoryTitle: event.target.value })} required maxLength={120} />
      </div>
      <FormMessages error={error} notice={notice} />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Issuing…" : "Issue certificate"}
      </Button>
    </form>
  );
}

export function PayoutActions({ ambassadorId, canUseRazorpayX, razorpayXReason }: { ambassadorId: string; canUseRazorpayX: boolean; razorpayXReason: string | null }) {
  const [utr, setUtr] = React.useState("");
  const [tds, setTds] = React.useState("");
  const { error, notice, pending, run } = useAction();
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={pending || !canUseRazorpayX} onClick={() => run(() => payViaRazorpayXAction(ambassadorId), "Payout sent to RazorpayX.")}>
          Pay via RazorpayX
        </Button>
        {razorpayXReason && <span className="text-xs text-muted-foreground">{razorpayXReason}</span>}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          run(() => recordManualPayoutAction({ ambassadorId, utr, tdsRupees: tds }), "Payout recorded.");
        }}
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
      >
        <Input label="Bank UTR (paid outside)" value={utr} onChange={(event) => setUtr(event.target.value)} maxLength={30} required />
        <Input label="TDS deducted (₹)" type="number" min={0} step="0.01" value={tds} onChange={(event) => setTds(event.target.value)} />
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          Record payout
        </Button>
      </form>
      <FormMessages error={error} notice={notice} />
    </div>
  );
}
