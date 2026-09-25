module mux4 (
    input  logic [3:0] data,
    input  logic [1:0] select,
    output logic       y
);
    always_comb begin
        case (select)
            2'b00: y = data[0];
            2'b01: y = data[1];
            2'b10: y = data[2];
            2'b11: y = data[3];
        endcase
    end
endmodule
