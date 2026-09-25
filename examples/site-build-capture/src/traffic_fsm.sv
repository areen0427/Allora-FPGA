module traffic_fsm (
    input  logic clk,
    input  logic reset_n,
    input  logic advance,
    output logic red,
    output logic yellow,
    output logic green
);
    typedef enum logic [1:0] {RED, GREEN, YELLOW} state_t;
    state_t state, next_state;

    always_ff @(posedge clk or negedge reset_n) begin
        if (!reset_n) state <= RED;
        else          state <= next_state;
    end

    always_comb begin
        next_state = state;
        if (advance) begin
            case (state)
                RED:     next_state = GREEN;
                GREEN:   next_state = YELLOW;
                YELLOW:  next_state = RED;
                default: next_state = RED;
            endcase
        end
    end

    assign red    = state == RED;
    assign yellow = state == YELLOW;
    assign green  = state == GREEN;
endmodule
