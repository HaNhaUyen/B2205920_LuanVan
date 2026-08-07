import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

@Injectable()
export class DepartureCapacityService {
  async holdSlots(tx: Tx, departureId: bigint, guestCount: number) {
    this.assertPositiveGuestCount(guestCount);

    const affected = await tx.$executeRaw`
      UPDATE tour_departures
      SET held_slots = held_slots + ${guestCount},
          updated_at = NOW()
      WHERE id = ${departureId}
        AND status = 'open'
        AND total_slots - booked_slots - held_slots >= ${guestCount}
    `;

    if (Number(affected) !== 1) {
      throw new BadRequestException(
        "Lịch khởi hành không còn đủ chỗ cho số khách đã chọn.",
      );
    }
  }

  async convertHeldToBooked(tx: Tx, departureId: bigint, guestCount: number) {
    this.assertPositiveGuestCount(guestCount);

    const affected = await tx.$executeRaw`
      UPDATE tour_departures
      SET held_slots = held_slots - ${guestCount},
          booked_slots = booked_slots + ${guestCount},
          updated_at = NOW()
      WHERE id = ${departureId}
        AND held_slots >= ${guestCount}
        AND booked_slots + held_slots <= total_slots
    `;

    if (Number(affected) !== 1) {
      throw new BadRequestException(
        "Không thể xác nhận thanh toán vì số chỗ giữ không hợp lệ.",
      );
    }
  }

  async releaseHeldSlots(tx: Tx, departureId: bigint, guestCount: number) {
    this.assertPositiveGuestCount(guestCount);

    const affected = await tx.$executeRaw`
      UPDATE tour_departures
      SET held_slots = held_slots - ${guestCount},
          updated_at = NOW()
      WHERE id = ${departureId}
        AND held_slots >= ${guestCount}
    `;

    if (Number(affected) !== 1) {
      throw new BadRequestException(
        "Không thể giải phóng chỗ vì số chỗ đang giữ không hợp lệ.",
      );
    }
  }

  async releaseBookedSlots(tx: Tx, departureId: bigint, guestCount: number) {
    this.assertPositiveGuestCount(guestCount);

    const affected = await tx.$executeRaw`
      UPDATE tour_departures
      SET booked_slots = booked_slots - ${guestCount},
          updated_at = NOW()
      WHERE id = ${departureId}
        AND booked_slots >= ${guestCount}
    `;

    if (Number(affected) !== 1) {
      throw new BadRequestException(
        "Không thể trả lại chỗ vì số chỗ đã đặt không hợp lệ.",
      );
    }
  }

  private assertPositiveGuestCount(guestCount: number) {
    if (!Number.isInteger(guestCount) || guestCount <= 0) {
      throw new BadRequestException("Số khách không hợp lệ.");
    }
  }
}
