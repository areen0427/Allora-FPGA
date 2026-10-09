module lane(input clk, input rst, input en, input [3:0] a, output reg [3:0] q);
  always @(posedge clk) if (rst) q <= 0; else if (en) q <= q + a;
endmodule
module explorer_top(input clk, input rst, input en, input [3:0] a, input choose,
                    inout pad, output [3:0] q, output selected);
  wire [3:0] registered;
  lane storage(.clk(clk), .rst(rst), .en(en), .a(a), .q(registered));
  reg [3:0] memory [0:3];
  always @(posedge clk) if (en) memory[a[1:0]] <= registered;
  assign q = memory[a[1:0]];
  assign selected = choose ? (registered == 4'b1010) : pad;
endmodule
