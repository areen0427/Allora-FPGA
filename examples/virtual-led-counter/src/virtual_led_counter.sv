module virtual_led_counter (
  input  logic       clk,
  input  logic       reset,
  input  logic       enable,
  input  logic       button,
  output logic [3:0] leds
);
  always_ff @(posedge clk) begin
    if (reset)
      leds <= 4'b0000;
    else if (enable || button)
      leds <= leds + 4'b0001;
  end
endmodule
