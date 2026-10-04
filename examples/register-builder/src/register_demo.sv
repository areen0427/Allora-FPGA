module register_demo (
  input wire clk,
  input wire rst,
  input wire enable,
  output reg [7:0] count
);
  always @(posedge clk) begin
    if (rst) count <= 8'h00;
    else if (enable) count <= count + 1'b1;
  end
endmodule
