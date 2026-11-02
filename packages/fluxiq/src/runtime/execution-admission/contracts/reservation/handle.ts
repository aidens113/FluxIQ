declare const reservationBrand: unique symbol;

export interface ExecutionReservation {
  readonly [reservationBrand]: never;
}
