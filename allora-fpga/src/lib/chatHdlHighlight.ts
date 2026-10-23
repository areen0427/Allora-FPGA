export type HdlToken = { text: string; kind?: "keyword" | "comment" | "string" | "number" };

const VERILOG_KEYWORDS = new Set(("module endmodule input output inout wire reg logic bit byte shortint int longint integer time real realtime signed unsigned parameter localparam typedef enum struct union packed automatic static function endfunction task endtask return void class endclass interface endinterface modport package endpackage import export program endprogram virtual const var genvar generate endgenerate begin end fork join join_any join_none always always_ff always_comb always_latch initial final assign deassign force release if else case casex casez endcase default unique priority for foreach while do repeat forever break continue wait disable posedge negedge edge or and not xor xnor nand nor buf tran supply0 supply1 tri trireg wand wor event specify endspecify property endproperty sequence endsequence assert assume cover expect clocking endclocking rand randc constraint endconstraint inside dist with new this super null true false").split(" "));
const VHDL_KEYWORDS = new Set(("library use entity is port generic in out inout buffer linkage architecture of begin end signal variable constant type subtype array record units access file component configuration package body procedure function return process block generate for if then else elsif case when others loop while next exit wait until on after before transport inertial reject rising_edge falling_edge std_logic std_logic_vector std_ulogic std_ulogic_vector bit bit_vector integer natural positive unsigned signed boolean true false to downto range all open map severity report assert not and or nand nor xor xnor mod rem abs sll srl sla sra rol ror select with null shared impure pure postponed protected context force release").split(" "));

export function chatHdlLanguage(language: string): "verilog" | "vhdl" | undefined {
  const normalized = language.toLowerCase().replace(/[\s_-]/g, "");
  if (["v", "sv", "verilog", "systemverilog"].includes(normalized)) return "verilog";
  if (["vhd", "vhdl"].includes(normalized)) return "vhdl";
  return undefined;
}

/** Small lexical highlighter: React renders every token as escaped text. */
export function highlightChatHdl(code: string, language: string): HdlToken[] {
  const mode = chatHdlLanguage(language);
  if (!mode || code.length > 200_000) return [{ text: code }];
  const tokens: HdlToken[] = [];
  const pattern = mode === "verilog"
    ? /\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)|"(?:\\[^\n]|[^"\\\n])*(?:"|$)|\b(?:\d+)?'[sS]?[bBoOdDhH][\da-fA-F_xXzZ?]+|'[01xXzZ]|\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b|\b[A-Za-z_$][\w$]*\b/g
    : /--[^\n]*|"(?:""|[^"\n])*(?:"|$)|'[^'\n]'|\b\d+(?:#[\da-fA-F_.]+#)?(?:\.\d+)?(?:[eE][+-]?\d+)?\b|\b[A-Za-z][\w]*\b/g;
  let cursor = 0;
  for (const match of code.matchAll(pattern)) {
    if (match.index > cursor) tokens.push({ text: code.slice(cursor, match.index) });
    const text = match[0];
    const comment = mode === "verilog" ? text.startsWith("//") || text.startsWith("/*") : text.startsWith("--");
    const string = text.startsWith('"') || (mode === "vhdl" && text.startsWith("'"));
    const keyword = (mode === "verilog" ? VERILOG_KEYWORDS : VHDL_KEYWORDS).has(mode === "vhdl" ? text.toLowerCase() : text);
    const kind = comment ? "comment" : string ? "string" : keyword ? "keyword" : /^[\d']/.test(text) ? "number" : undefined;
    tokens.push({ text, ...(kind ? { kind } : {}) });
    cursor = match.index + text.length;
  }
  if (cursor < code.length) tokens.push({ text: code.slice(cursor) });
  return tokens;
}
