// 1.8432 MHz clock, 115200 baud (16 clocks/bit). Direct display, UART echo.
module workbench_demo (
  input wire clk,
  input wire [1:0] controls,
  input wire rx,
  output wire [1:0] leds,
  output wire [7:0] segments,
  output reg tx = 1'b1,
  output reg [7:0] received = 0
);
  assign leds = {~controls[1], controls[0] ^ controls[1]};
  assign segments = controls[0] ? 8'b11111111 : 8'b00111111; // 8+DP or 0
  reg [3:0] rx_bit = 0;
  reg [7:0] rx_shift = 0;
  reg [4:0] rx_count = 0;
  reg receiving = 0;
  reg [9:0] tx_shift = 10'b1111111111;
  reg [3:0] tx_bits = 0;
  reg [4:0] tx_count = 0;
  always @(posedge clk) begin
    if (!receiving) begin
      if (!rx) begin receiving <= 1; rx_count <= 23; rx_bit <= 0; end
    end else if (rx_count != 0) rx_count <= rx_count - 1;
    else begin
      rx_count <= 15;
      if (rx_bit < 8) begin rx_shift[rx_bit] <= rx; rx_bit <= rx_bit + 1; end
      else begin
        receiving <= 0;
        if (rx) begin
          received <= rx_shift;
          tx_shift <= {1'b1, rx_shift, 1'b0}; tx_bits <= 10; tx_count <= 0;
        end
      end
    end
    if (tx_bits != 0) begin
      if (tx_count == 0) begin
        tx <= tx_shift[0]; tx_shift <= {1'b1, tx_shift[9:1]};
        tx_bits <= tx_bits - 1; tx_count <= 15;
      end else tx_count <= tx_count - 1;
    end
  end
endmodule
