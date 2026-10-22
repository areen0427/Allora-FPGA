module top (
    input  logic clk12,
    output logic rgb_red
);
    logic [23:0] divider = 24'd0;

    always_ff @(posedge clk12) begin
        divider <= divider + 1'b1;
    end

    // iCEBreaker RGB LED is active low.
    assign rgb_red = ~divider[23];
endmodule
