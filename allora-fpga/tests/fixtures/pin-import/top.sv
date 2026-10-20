module helper(output ignored);
  assign ignored = 1'b0;
endmodule

module top(input clk, output logic [9:8] status, output done);
  assign status = 2'b10;
  assign done = clk;
endmodule
