import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logError, logInfo, logWarn, setErrorSink } from "../logger";

// El logger es el punto único de captura: aquí se comprueba que reenvía los
// errores (y solo los errores) al sink externo y al webhook opcional, y que un
// sink que falla nunca rompe al llamante.
describe("logger — sinks de error", () => {
  beforeEach(() => {
    // Silencia la salida de consola del propio logger durante los tests.
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    setErrorSink(null);
    delete process.env.ERROR_WEBHOOK_URL;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("reenvía logError al sink registrado con evento, error y contexto", () => {
    const sink = vi.fn();
    setErrorSink(sink);
    const err = new Error("boom");

    logError("db.query.failed", err, { businessId: "b1" });

    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink).toHaveBeenCalledWith("db.query.failed", err, {
      businessId: "b1",
    });
  });

  it("no reenvía info ni warn al sink de errores", () => {
    const sink = vi.fn();
    setErrorSink(sink);

    logInfo("something.info");
    logWarn("something.warn");

    expect(sink).not.toHaveBeenCalled();
  });

  it("un sink que lanza no rompe al llamante", () => {
    setErrorSink(() => {
      throw new Error("sink roto");
    });
    expect(() => logError("x", new Error("y"))).not.toThrow();
  });

  it("publica en ERROR_WEBHOOK_URL cuando está definido (fire-and-forget)", () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null)));
    vi.stubGlobal("fetch", fetchMock);
    process.env.ERROR_WEBHOOK_URL = "https://hooks.example/test";

    logError("payment.charge.failed", new Error("card declined"), {
      appointmentId: "a1",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://hooks.example/test");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body.event).toBe("payment.charge.failed");
    expect(body.error.message).toBe("card declined");
    expect(body.context).toEqual({ appointmentId: "a1" });
    expect(body.text).toContain("payment.charge.failed");
  });

  it("no publica en el webhook si ERROR_WEBHOOK_URL no está definido", () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null)));
    vi.stubGlobal("fetch", fetchMock);

    logError("x", new Error("y"));

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
