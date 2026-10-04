// Generated integration wrapper. Original design files are preserved.
// Clock/reset connections and hardware mappings were explicitly selected in Register Builder.
// Exposed rb_* inputs require a bus master / hardware source; map physical pins or virtual inputs.
module demo_registers_top (
  input wire clk,
  input wire rst,
  output wire [7:0] count,
  input wire [7:0] rb_addr,
  input wire [31:0] rb_wr_data,
  output wire [31:0] rb_rd_data,
  input wire rb_wr_en,
  input wire rb_rd_en,
  output wire [7:0] rb_reg_CONTROL_value_o,
  output wire rb_reg_CONTROL_write_o,
  output wire rb_field_CONTROL_ENABLE_value_o,
  output wire [7:0] rb_reg_STATUS_value_o,
  output wire rb_reg_STATUS_write_o,
  output wire [7:0] rb_reg_COMMAND_value_o,
  output wire rb_reg_COMMAND_write_o,
  output wire [7:0] rb_reg_FLAGS_value_o,
  output wire rb_reg_FLAGS_write_o,
  input wire [7:0] rb_reg_FLAGS_set_i
);

  register_demo u_design (
    .clk(clk),
    .rst(rst),
    .enable(rb_field_CONTROL_ENABLE_value_o),
    .count(count)
  );

  demo_registers u_register_map (
    .clk(clk),
    .rst(rst),
    .addr(rb_addr),
    .wr_data(rb_wr_data),
    .rd_data(rb_rd_data),
    .wr_en(rb_wr_en),
    .rd_en(rb_rd_en),
    .reg_CONTROL_value_o(rb_reg_CONTROL_value_o),
    .reg_CONTROL_write_o(rb_reg_CONTROL_write_o),
    .field_CONTROL_ENABLE_value_o(rb_field_CONTROL_ENABLE_value_o),
    .reg_STATUS_value_o(rb_reg_STATUS_value_o),
    .reg_STATUS_write_o(rb_reg_STATUS_write_o),
    .field_STATUS_COUNT_i(count),
    .reg_COMMAND_value_o(rb_reg_COMMAND_value_o),
    .reg_COMMAND_write_o(rb_reg_COMMAND_write_o),
    .reg_FLAGS_value_o(rb_reg_FLAGS_value_o),
    .reg_FLAGS_write_o(rb_reg_FLAGS_write_o),
    .reg_FLAGS_set_i(rb_reg_FLAGS_set_i)
  );
endmodule
