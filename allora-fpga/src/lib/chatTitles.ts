/** Short local titles keep chat history readable without another model request. */
export function createChatTitle(prompt: string): string {
  const subject = prompt.trim()
    .replace(/^(?:(?:please|hey|hi)[,!]?\s+)+/i, "")
    .replace(/^(?:can|could|would)\s+you\s+(?:please\s+)?/i, "")
    .replace(/^(?:i\s+(?:want|need)(?:\s+you)?\s+to\s+|help\s+me\s+(?:to\s+)?)/i, "")
    .replace(/^(?:create|make|write|build|design|generate|implement)\s+(?:(?:me|us)\s+)?(?:(?:a|an|the)\s+)?/i, "")
    .split(/(?:[.!?;,\n]|\s+(?:on|using|with|that|then|and|in|for|save)\s+)/i)[0]
    .replace(/\bdesing\b/gi, "design")
    .replace(/\s+/g, " ")
    .trim();
  const acronyms: Record<string, string> = {
    led: "LED", leds: "LEDs", fpga: "FPGA", rtl: "RTL", hdl: "HDL", uart: "UART",
    spi: "SPI", i2c: "I2C", pwm: "PWM", cpu: "CPU", ram: "RAM", rom: "ROM",
    pll: "PLL", usb: "USB", systemverilog: "SystemVerilog", verilog: "Verilog",
  };
  const words = subject.split(/\s+/).filter(Boolean).slice(0, 6);
  const title = words.map((word) => acronyms[word.toLowerCase()] ??
    (/^[A-Z0-9_-]+$/.test(word) ? word : word.charAt(0).toUpperCase() + word.slice(1))).join(" ");
  return title.slice(0, 80).trim() || "New Chat";
}
