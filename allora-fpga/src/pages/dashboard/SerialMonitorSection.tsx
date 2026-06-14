import { useEffect, useRef, useState } from "react";
import type { BoardDefinition } from "../../data/boards";
import { resolveBoardProgrammer } from "../../data/boardProgrammers";
import InfoCard, { InfoRow } from "./InfoCard";
import { createTauriChannel, hasTauriInvoke, invokeTauri } from "../../lib/tauri";

type SerialPortRecord = {
  portName: string;
  description: string;
};

const BAUD_RATES = [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600];
const MAX_OUTPUT_CHARS = 200_000;

type LineEnding = "none" | "lf" | "crlf";

const LINE_ENDINGS: Record<LineEnding, string> = {
  none: "",
  lf: "\n",
  crlf: "\r\n",
};

export default function SerialMonitorSection({ board }: { board: BoardDefinition }) {
  const [ports, setPorts] = useState<SerialPortRecord[]>([]);
  const [selectedPort, setSelectedPort] = useState("");
  const [baudRate, setBaudRate] = useState(115200);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [output, setOutput] = useState("");
  const [draft, setDraft] = useState("");
  const [lineEnding, setLineEnding] = useState<LineEnding>("lf");
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const consoleRef = useRef<HTMLPreElement | null>(null);
  const sessionRef = useRef<number | null>(null);

  const programmer = resolveBoardProgrammer(board);
  const isConnected = sessionId !== null;

  useEffect(() => {
    void refreshPorts();
    // Close the session when the section unmounts so the OS port is released.
    return () => {
      if (sessionRef.current !== null) {
        void invokeTauri("close_serial_monitor", {
          request: { sessionId: sessionRef.current },
        }).catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [output]);

  async function refreshPorts() {
    if (!hasTauriInvoke()) return;

    try {
      const found = await invokeTauri<SerialPortRecord[]>("list_serial_ports");
      setPorts(found);
      setSelectedPort((current) => {
        if (current && found.some((port) => port.portName === current)) {
          return current;
        }
        const usbPort = found.find((port) =>
          `${port.portName} ${port.description}`.toLowerCase().includes("usb")
        );
        return usbPort?.portName ?? found[0]?.portName ?? "";
      });
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  }

  async function connect() {
    if (!selectedPort || !hasTauriInvoke()) return;

    setIsBusy(true);
    setErrorMessage("");
    const channel = createTauriChannel<string>((chunk) => {
      setOutput((current) => (current + chunk).slice(-MAX_OUTPUT_CHARS));
    });

    try {
      const id = await invokeTauri<number>("open_serial_monitor", {
        onData: channel,
        request: { portName: selectedPort, baudRate },
      });
      setSessionId(id);
      sessionRef.current = id;
      setStatusMessage(`Connected to ${selectedPort} at ${baudRate} baud.`);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function disconnect() {
    if (sessionId === null) return;

    setIsBusy(true);
    try {
      await invokeTauri("close_serial_monitor", { request: { sessionId } });
    } catch {
      // Closing a dead session is fine.
    } finally {
      setSessionId(null);
      sessionRef.current = null;
      setStatusMessage("Disconnected.");
      setIsBusy(false);
    }
  }

  async function send() {
    if (sessionId === null) return;

    try {
      await invokeTauri("write_serial_monitor", {
        request: { sessionId, data: draft + LINE_ENDINGS[lineEnding] },
      });
      setDraft("");
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) 240px",
        gap: "22px",
        alignItems: "start",
        height: "calc(100vh - 48px)",
        boxSizing: "border-box",
        padding: "8px",
        margin: "-8px",
        minHeight: 0,
        overflow: "visible",
      }}
    >
      <InfoCard
        title="Serial Monitor"
        style={{
          height: "100%",
          minHeight: 0,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div className="serial-toolbar">
          <select
            className="serial-control"
            value={selectedPort}
            onChange={(event) => setSelectedPort(event.target.value)}
            disabled={isConnected}
            aria-label="Serial port"
          >
            {ports.length === 0 ? <option value="">No serial ports found</option> : null}
            {ports.map((port) => (
              <option key={port.portName} value={port.portName}>
                {port.portName}
                {port.description ? ` — ${port.description}` : ""}
              </option>
            ))}
          </select>

          <select
            className="serial-control"
            value={baudRate}
            onChange={(event) => setBaudRate(Number(event.target.value))}
            disabled={isConnected}
            aria-label="Baud rate"
          >
            {BAUD_RATES.map((rate) => (
              <option key={rate} value={rate}>
                {rate}
              </option>
            ))}
          </select>

          <button
            type="button"
            className="synthesis-secondary-button"
            onClick={() => void refreshPorts()}
            disabled={isConnected}
          >
            Refresh
          </button>

          <button
            type="button"
            className="primary-action synthesis-generate-button"
            disabled={isBusy || (!isConnected && !selectedPort) || !hasTauriInvoke()}
            onClick={() => void (isConnected ? disconnect() : connect())}
          >
            {isConnected ? "Disconnect" : "Connect"}
          </button>
        </div>

        <div className={`serial-status${errorMessage ? " error" : ""}`}>
          {errorMessage
            ? errorMessage
            : isConnected
              ? statusMessage
              : hasTauriInvoke()
                ? statusMessage || "Pick the board's USB serial port and connect to talk to your design."
                : "Launch the Tauri desktop app to use the serial monitor."}
        </div>

        <pre className="serial-console" ref={consoleRef}>
          {output || "No serial data yet."}
        </pre>

        <div className="serial-input-row">
          <input
            className="serial-control serial-input"
            value={draft}
            placeholder={isConnected ? "Type and press Enter to send" : "Connect to send data"}
            disabled={!isConnected}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void send();
              }
            }}
          />
          <select
            className="serial-control"
            value={lineEnding}
            onChange={(event) => setLineEnding(event.target.value as LineEnding)}
            aria-label="Line ending"
          >
            <option value="lf">LF</option>
            <option value="crlf">CRLF</option>
            <option value="none">No ending</option>
          </select>
          <button
            type="button"
            className="synthesis-secondary-button"
            disabled={!isConnected}
            onClick={() => void send()}
          >
            Send
          </button>
          <button
            type="button"
            className="synthesis-secondary-button"
            disabled={!output}
            onClick={() => setOutput("")}
          >
            Clear
          </button>
        </div>
      </InfoCard>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          maxHeight: "100%",
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        <InfoCard title="Connection" style={{ padding: "14px", borderRadius: "16px" }} compact>
          <InfoRow label="Status" value={isConnected ? "Connected" : "Idle"} compact />
          <InfoRow label="Port" value={selectedPort || "None"} compact />
          <InfoRow label="Baud" value={String(baudRate)} compact />
          <InfoRow label="Ports Found" value={String(ports.length)} compact />
        </InfoCard>

        <InfoCard title="Board" style={{ padding: "14px", borderRadius: "16px" }} compact>
          <InfoRow label="Name" value={board.name} compact />
          <InfoRow label="Programmer" value={programmer?.command ?? "None"} compact />
          {programmer?.usbVendorId && programmer?.usbProductId ? (
            <InfoRow
              label="USB ID"
              value={`${programmer.usbVendorId.toString(16).padStart(4, "0")}:${programmer.usbProductId
                .toString(16)
                .padStart(4, "0")}`}
              compact
            />
          ) : null}
        </InfoCard>

        <InfoCard title="Tip" style={{ padding: "14px", borderRadius: "16px" }} compact>
          <div className="serial-tip">
            The UART Hello template transmits at 115200 baud — flash it, connect here, and you
            should see the greeting stream in.
          </div>
        </InfoCard>
      </div>
    </div>
  );
}

function getErrorMessage(error: unknown) {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const value = (error as { message?: unknown }).message;
    if (typeof value === "string") return value;
  }
  return "Serial operation failed.";
}
