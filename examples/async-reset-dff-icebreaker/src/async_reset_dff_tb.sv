`timescale 1ns/1ps
module async_reset_dff_tb;
  logic clk = 0, rst_n = 0, d = 0;
  logic q;
  async_reset_dff dut (.clk(clk), .rst_n(rst_n), .d(d), .q(q));
  always #5 clk = ~clk;
  initial begin
    $dumpfile("async_reset_dff.vcd");
    $dumpvars(0, async_reset_dff_tb);
    #12;
    if (q !== 0) $fatal(1, "Reset failed");
    rst_n = 1;
    #8 d = 1;
    #6;
    if (q !== 1) $fatal(1, "Capture failed");
    #14 d = 0;
    #6;
    if (q !== 0) $fatal(1, "Clear failed");
    #4 d = 1;
    #6 rst_n = 0;
    #1;
    if (q !== 0) $fatal(1, "Async reset failed");
    #13 $finish;
  end
endmodule
