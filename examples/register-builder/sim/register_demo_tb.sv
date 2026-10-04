module register_demo_tb;
  reg clk = 0, rst = 1, rb_wr_en = 0, rb_rd_en = 1;
  reg [7:0] rb_addr = 0;
  reg [31:0] rb_wr_data = 0;
  reg [7:0] rb_reg_FLAGS_set_i = 0;
  wire [31:0] rb_rd_data;
  wire [7:0] count, rb_reg_COMMAND_value_o;
  demo_registers_top dut (
    .clk(clk), .rst(rst), .count(count),
    .rb_addr(rb_addr), .rb_wr_data(rb_wr_data), .rb_rd_data(rb_rd_data),
    .rb_wr_en(rb_wr_en), .rb_rd_en(rb_rd_en),
    .rb_reg_FLAGS_set_i(rb_reg_FLAGS_set_i),
    .rb_reg_COMMAND_value_o(rb_reg_COMMAND_value_o)
  );
  task tick; begin #5; clk = 1; #5; clk = 0; end endtask
  initial begin
    $dumpfile("register_demo_tb.vcd"); $dumpvars(0, register_demo_tb);
    tick; rst = 0;
    rb_wr_en = 1; rb_wr_data = 1; tick; rb_wr_en = 0;
    tick; tick; rb_addr = 4; #1;
    if (rb_rd_data !== 2) $fatal(1, "register-driven counter / hardware status");
    rb_addr = 8; rb_wr_data = 8'h5a; rb_wr_en = 1; tick; rb_wr_en = 0; #1;
    if (rb_rd_data !== 0 || rb_reg_COMMAND_value_o !== 8'h5a) $fatal(1, "WO semantics");
    rb_addr = 12; rb_wr_data = 1; rb_wr_en = 1; tick; rb_wr_en = 0; #1;
    if (rb_rd_data !== 2) $fatal(1, "W1C semantics");
    $display("REGISTER_PROJECT_PASS"); $finish;
  end
endmodule
