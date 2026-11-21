import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { PrintOffer } from "@/features/print-orders/pricing";

// ---------------------------------------------------------------------------
// Printed certificate forms: the student's order form prices courier delivery from the PIN code
// (NCR or outside); the administrators' settings form saves prices, times and NCR PIN codes.
// ---------------------------------------------------------------------------

const { actions, refresh, toastSuccess } = vi.hoisted(() => ({
  actions: {
    startPrintCheckoutAction: vi.fn(),
    confirmPrintCheckoutAction: vi.fn(),
    advancePrintOrderAction: vi.fn(),
    updatePrintSettingsAction: vi.fn(),
  },
  refresh: vi.fn(),
  toastSuccess: vi.fn(),
}));
vi.mock("@/features/print-orders/actions", () => actions);
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/components/ui/toast", () => ({ toast: { success: toastSuccess, info: vi.fn(), error: vi.fn() } }));

import { PrintOrderForm } from "@/features/print-orders/components/print-order-forms";
import { PrintSettingsForm, type PrintSettingsFormValues } from "@/features/print-orders/components/print-settings-form";

const OFFER: PrintOffer = {
  open: true,
  collegeBulk: { pricePaise: 9_900, expectedDelivery: "7–12 working days" },
  courierNcr: { pricePaise: 14_900, expectedDelivery: "5–8 working days" },
  courierOutside: { pricePaise: 17_900, expectedDelivery: "7–12 working days" },
  ncrPinPrefixes: ["110", "201", "122", "121"],
  courierPartner: null,
};

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("PrintOrderForm", () => {
  it("shows both options with their prices and starts with bulk through the college", () => {
    render(<PrintOrderForm certificateId="c1" offer={OFFER} defaultName="Test" collegeName="ABC Institute" />);
    expect(screen.getByRole("radio", { name: /Through your college/ })).toHaveProperty("checked", true);
    expect(screen.getByText("₹149–₹179")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pay ₹99" })).toBeTruthy();
  });

  it("prices courier delivery from the PIN code: NCR or outside", () => {
    render(<PrintOrderForm certificateId="c1" offer={OFFER} defaultName="Test" collegeName="ABC Institute" />);
    fireEvent.click(screen.getByRole("radio", { name: /Courier to your address/ }));
    const pin = screen.getByLabelText("PIN code");
    expect(screen.getByRole("button", { name: "Pay" })).toBeTruthy();

    fireEvent.change(pin, { target: { value: "110001" } });
    expect(screen.getByRole("status").textContent).toContain("Within NCR");
    expect(screen.getByRole("status").textContent).toContain("5–8 working days");
    expect(screen.getByRole("button", { name: "Pay ₹149" })).toBeTruthy();

    fireEvent.change(pin, { target: { value: "560038" } });
    expect(screen.getByRole("status").textContent).toContain("Outside NCR");
    expect(screen.getByRole("status").textContent).toContain("7–12 working days");
    expect(screen.getByRole("button", { name: "Pay ₹179" })).toBeTruthy();
  });

  it("blocks paying for a PIN code whose zone has no price", () => {
    render(<PrintOrderForm certificateId="c1" offer={{ ...OFFER, courierOutside: null }} defaultName="Test" collegeName={null} />);
    // Without a college, bulk cannot be chosen; courier is selected.
    expect(screen.getByRole("radio", { name: /Through your college/ })).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByLabelText("PIN code"), { target: { value: "560038" } });
    expect(screen.getByRole("status").textContent).toContain("not available for this PIN code");
    expect(screen.getByRole("button", { name: "Pay" })).toHaveProperty("disabled", true);
  });
});

describe("PrintSettingsForm", () => {
  const initial: PrintSettingsFormValues = {
    orderingOpen: false,
    collegeBulkPrice: "",
    courierNcrPrice: "",
    courierOutsidePrice: "",
    collegeBulkDelivery: "",
    courierNcrDelivery: "",
    courierOutsideDelivery: "",
    ncrPinPrefixes: "",
    courierPartner: "",
  };

  it("saves the typed settings with the NCR PIN codes as a list", async () => {
    actions.updatePrintSettingsAction.mockResolvedValue({ success: true, data: null });
    render(<PrintSettingsForm initial={initial} cancelHref="/admin/print-orders" />);
    fireEvent.click(screen.getByRole("radio", { name: "Open" }));
    fireEvent.change(screen.getByLabelText("College bulk price"), { target: { value: "99" } });
    fireEvent.change(screen.getByLabelText("College bulk delivery time"), { target: { value: "7–12 working days" } });
    fireEvent.change(screen.getByLabelText("Courier price within NCR"), { target: { value: "₹149" } });
    fireEvent.change(screen.getByLabelText("Delivery time within NCR"), { target: { value: "5–8 working days" } });
    fireEvent.change(screen.getByLabelText("NCR PIN codes"), { target: { value: "110, 201 122,121" } });
    fireEvent.change(screen.getByLabelText("Courier price outside NCR"), { target: { value: "179" } });
    fireEvent.change(screen.getByLabelText("Delivery time outside NCR"), { target: { value: "7–12 working days" } });
    expect(screen.getByRole("list", { name: "NCR PIN codes added" }).children).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Print settings saved."));
    expect(actions.updatePrintSettingsAction).toHaveBeenCalledWith({
      orderingOpen: true,
      collegeBulkPrice: "99",
      courierNcrPrice: "149",
      courierOutsidePrice: "179",
      collegeBulkDelivery: "7–12 working days",
      courierNcrDelivery: "5–8 working days",
      courierOutsideDelivery: "7–12 working days",
      ncrPinPrefixes: ["110", "201", "122", "121"],
      courierPartner: "",
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("keeps a bad NCR PIN code on the form and shows the server's error inline", async () => {
    render(<PrintSettingsForm initial={{ ...initial, ncrPinPrefixes: "110, 011" }} cancelHref="/admin/print-orders" />);
    expect(screen.getByText("NCR PIN codes are 2 to 6 digits and do not start with 0")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    expect(actions.updatePrintSettingsAction).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("do not start with 0");

    cleanup();
    actions.updatePrintSettingsAction.mockResolvedValue({ success: false, error: "Set at least one price before opening orders." });
    render(<PrintSettingsForm initial={{ ...initial, orderingOpen: true }} cancelHref="/admin/print-orders" />);
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Set at least one price"));
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});
