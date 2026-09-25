`timescale 1ns/1ps
module async_reset_dff_tb;
  logic clk = 0;
  logic rst_n = 0;
  logic d = 0;
  logic q;
  async_reset_dff dut (.clk(clk), .rst_n(rst_n), .d(d), .q(q));
  always #5 clk = ~clk;
  initial begin
    $dumpfile("async_reset_dff.vcd");
    $dumpvars(0, async_reset_dff_tb);
    #12 rst_n = 1;
    #8 d = 1;
    #20 d = 0;
    #20 rst_n = 0;
    #10 $finish;
  end
endmodule
