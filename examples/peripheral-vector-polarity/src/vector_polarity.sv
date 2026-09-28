// Clockless combinational example: workbench bits 63 and 62 are exact uint64 values.
module vector_polarity(input wire [63:0] inputs, output wire [63:0] outputs);
  assign outputs = ~inputs;
endmodule
