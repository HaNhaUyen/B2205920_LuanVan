import { useEffect, useMemo, useState } from "react";
import { formatCurrency, formatDate } from "@/lib/format";
import { apiFetch } from "@/lib/api";
import { updateStoredUser } from "@/lib/storage";

const steps = [
  ["schedule", "Lịch trình", "Lịch, số khách và điểm đón"],
  ["contact", "Liên hệ", "Thông tin người đặt tour"],
  ["guests", "Hành khách", "Thông tin chi tiết từng vé"],
  ["voucher", "Thanh toán", "Ưu đãi và tổng chi phí"],
  ["confirm", "Xác nhận", "Kiểm tra trước khi thanh toán"],
];

const inputStyle = {
  width: "100%",
  padding: "14px 16px",
  borderRadius: 12,
  border: "1px solid #cbd5e1",
  background: "#ffffff",
  color: "#0f172a",
  fontSize: "0.95rem",
  transition: "all 0.2s ease",
  outline: "none",
  boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
};

function Field({ label, required, error, children }) {
  return (
    <label
      style={{
        display: "grid",
        gap: 6,
        color: "#334155",
        fontWeight: 600,
        fontSize: "0.9rem",
      }}
    >
      <span>
        {label} {required ? <b style={{ color: "#ef4444" }}>*</b> : null}
      </span>
      {children}
      {error ? (
        <small
          style={{
            color: "#ef4444",
            fontWeight: 500,
            fontSize: "0.8rem",
            marginTop: 2,
          }}
        >
          {error}
        </small>
      ) : null}
    </label>
  );
}

function Stepper({ label, value, min, onChange }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "12px 16px",
        background: "#f8fafc",
        borderRadius: 12,
        border: "1px solid #e2e8f0",
      }}
    >
      <span style={{ color: "#0f172a", fontWeight: 600 }}>{label}</span>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          style={stepBtn}
        >
          -
        </button>
        <div
          style={{
            minWidth: 28,
            textAlign: "center",
            fontWeight: 700,
            color: "#0f172a",
            fontSize: "1.1rem",
          }}
        >
          {value}
        </div>
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          style={stepBtn}
        >
          +
        </button>
      </div>
    </div>
  );
}

const stepBtn = {
  width: 36,
  height: 36,
  borderRadius: "50%",
  border: "1px solid #cbd5e1",
  background: "#ffffff",
  color: "#475569",
  fontSize: 18,
  fontWeight: 600,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
};

function isGuestDone(guest) {
  const fullName = String(guest?.fullName || "").trim();
  const dateOfBirth = String(guest?.dateOfBirth || "").trim();
  const gender = String(guest?.gender || "").trim();
  const idNumber = String(guest?.idNumber || "").trim();
  const idType =
    guest?.idType ||
    (guest?.guestType === "adult" ? "id_card" : "birth_certificate");

  if (!fullName || !dateOfBirth || !gender || !idNumber) {
    return false;
  }

  if (idType === "id_card") {
    return /^\d{12}$/.test(idNumber);
  }

  if (idType === "passport") {
    return /^[A-Z]\d{7}$/.test(idNumber);
  }

  if (idType === "birth_certificate") {
    return /^\d{12}$/.test(idNumber);
  }

  return false;
}

function toLocalDateOnly(value) {
  if (!value) return null;

  const raw = String(value).trim();
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return new Date(Number(year), Number(month) - 1, Number(day), 0, 0, 0, 0);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  return new Date(
    parsed.getFullYear(),
    parsed.getMonth(),
    parsed.getDate(),
    0,
    0,
    0,
    0,
  );
}

function formatDateOnlyVi(value) {
  const date = toLocalDateOnly(value);
  if (!date) return "-";

  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function findDepartureConflict(departure, activeBookingPeriods = []) {
  const newStart = toLocalDateOnly(departure?.departureDate);
  const newEnd =
    toLocalDateOnly(departure?.endDate || departure?.departureDate) || newStart;

  if (!newStart || !newEnd) return null;

  return (
    (Array.isArray(activeBookingPeriods) ? activeBookingPeriods : []).find(
      (period) => {
        // Cho phép đặt thêm đúng cùng lịch khởi hành đã đặt trước đó.
        // Chỉ departure khác nhưng giao thời gian mới được xem là xung đột.
        const currentDepartureId =
          departure?.id ?? departure?.departureId ?? departure?.departure_id;
        const bookedDepartureId = period?.departureId ?? period?.departure_id;

        if (
          currentDepartureId != null &&
          bookedDepartureId != null &&
          String(currentDepartureId) === String(bookedDepartureId)
        ) {
          return false;
        }

        const oldStart = toLocalDateOnly(
          period?.startDate || period?.departureDate,
        );
        const oldEnd =
          toLocalDateOnly(
            period?.endDate || period?.startDate || period?.departureDate,
          ) || oldStart;

        if (!oldStart || !oldEnd) return false;

        // Inclusive ở cả hai đầu:
        // booking 17-20 khóa lịch 15-17, 17-18, 18-19, 20-22...
        return (
          newStart.getTime() <= oldEnd.getTime() &&
          newEnd.getTime() >= oldStart.getTime()
        );
      },
    ) || null
  );
}

export default function BookingWizardModal({
  open,
  onClose,
  onSubmit,
  tour,
  currentUser,
  activeBookingPeriods = [],
  selectedDepartureId,
  bookingPassengers,
  bookingGuests,
  pickupOptions,
  preview,
  availableVouchers,
  selectedVoucherCode,
  selectedVoucher,
  selectedVoucherDiscount,
  savedTravelers,
  setSelectedVoucherCode,
  handleDepartureChange,
  handlePassengerChange,
  handleGuestChange,
  handleSavedTravelerSelect,
  getAvailableSavedTravelers,
  getDepartureRemainingSlots,
  formatPickupTime,
  formatVoucherDiscount,
  estimateVoucherDiscount,
}) {
  const [step, setStep] = useState(0);
  const [pickupPointId, setPickupPointId] = useState("");
  const [contact, setContact] = useState({
    contactName: currentUser?.fullName || "",
    contactEmail: currentUser?.email || "",
    contactPhone: currentUser?.phone || "",
    note: "",
  });
  const [confirmed, setConfirmed] = useState(false);
  const [errors, setErrors] = useState({});
  const [profileContact, setProfileContact] = useState({
    fullName: currentUser?.fullName || "",
    email: currentUser?.email || "",
    phone: currentUser?.phone || "",
  });
  const [savingContactProfile, setSavingContactProfile] = useState(false);
  const [ownerProfile, setOwnerProfile] = useState({
    fullName: currentUser?.fullName || "",
    birthDate: currentUser?.birthDate || "",
    gender: currentUser?.gender || "",
    identityNumber: currentUser?.identityNumber || "",
  });
  const [savingOwnerProfile, setSavingOwnerProfile] = useState(false);
  const [validatedGuestIndexes, setValidatedGuestIndexes] = useState({});

  // Mỗi lần mở wizard, đồng bộ thông tin liên hệ mới nhất từ hồ sơ.
  // Điều này tránh việc modal giữ dữ liệu cũ từ localStorage hoặc lần mở trước.
  useEffect(() => {
    if (!open) return;

    const profileFullName = String(currentUser?.fullName || "").trim();
    const profileEmail = String(currentUser?.email || "").trim();
    const profilePhone = String(currentUser?.phone || "").trim();

    setProfileContact({
      fullName: profileFullName,
      email: profileEmail,
      phone: profilePhone,
    });

    setContact((prev) => ({
      contactName: profileFullName || prev.contactName || "",
      contactEmail: profileEmail || prev.contactEmail || "",
      contactPhone: profilePhone || prev.contactPhone || "",
      note: prev.note || "",
    }));
  }, [open, currentUser?.fullName, currentUser?.email, currentUser?.phone]);

  // Bước Hành khách: người đầu tiên là chủ tài khoản.
  // Nếu hồ sơ đã có thông tin thì tự điền vào vé và khóa không cho sửa/xóa.
  useEffect(() => {
    if (!open) return;

    const nextOwnerProfile = {
      fullName: String(currentUser?.fullName || "").trim(),
      birthDate: currentUser?.birthDate
        ? String(currentUser.birthDate).slice(0, 10)
        : "",
      gender: String(currentUser?.gender || "")
        .trim()
        .toLowerCase(),
      identityNumber: String(currentUser?.identityNumber || "").trim(),
    };

    setOwnerProfile(nextOwnerProfile);

    const ownerIndex = (
      Array.isArray(bookingGuests) ? bookingGuests : []
    ).findIndex((guest) => guest?.isAccountOwner);

    if (ownerIndex < 0) return;

    if (nextOwnerProfile.fullName) {
      handleGuestChange(
        ownerIndex,
        "fullName",
      )({
        target: { value: nextOwnerProfile.fullName },
      });
    }
    if (nextOwnerProfile.birthDate) {
      handleGuestChange(
        ownerIndex,
        "dateOfBirth",
      )({
        target: { value: nextOwnerProfile.birthDate },
      });
    }
    if (nextOwnerProfile.gender) {
      handleGuestChange(
        ownerIndex,
        "gender",
      )({
        target: { value: nextOwnerProfile.gender },
      });
    }
    if (nextOwnerProfile.identityNumber) {
      handleGuestChange(
        ownerIndex,
        "idType",
      )({
        target: { value: "id_card" },
      });
      handleGuestChange(
        ownerIndex,
        "idNumber",
      )({
        target: { value: nextOwnerProfile.identityNumber },
      });
    }
  }, [
    open,
    currentUser?.fullName,
    currentUser?.birthDate,
    currentUser?.gender,
    currentUser?.identityNumber,
  ]);

  const selectedDeparture = useMemo(
    () =>
      (tour?.departures || []).find(
        (item) =>
          String(item.id) ===
          String(selectedDepartureId || tour?.departures?.[0]?.id),
      ),
    [tour, selectedDepartureId],
  );
  const selectedDepartureConflict = useMemo(
    () => findDepartureConflict(selectedDeparture, activeBookingPeriods),
    [selectedDeparture, activeBookingPeriods],
  );
  const remainingSlots = getDepartureRemainingSlots(selectedDeparture || {});
  const totalGuests =
    Number(bookingPassengers.adultCount || 0) +
    Number(bookingPassengers.childCount || 0);
  const finalAmount = Math.max(
    Number(preview?.total || 0) - Number(selectedVoucherDiscount || 0),
    0,
  );

  const contactNameLocked = Boolean(
    String(profileContact.fullName || "").trim(),
  );
  const contactEmailLocked = Boolean(String(profileContact.email || "").trim());
  const contactPhoneLocked = Boolean(String(profileContact.phone || "").trim());

  const ownerFullNameLocked = Boolean(
    String(ownerProfile.fullName || "").trim(),
  );
  const ownerBirthDateLocked = Boolean(
    String(ownerProfile.birthDate || "").trim(),
  );
  const ownerGenderLocked = Boolean(String(ownerProfile.gender || "").trim());
  const ownerIdentityLocked = Boolean(
    String(ownerProfile.identityNumber || "").trim(),
  );

  if (!open) return null;

  const setPassenger = (field, value) =>
    handlePassengerChange(field)({ target: { value } });

  const validateGuestDocumentOnDemand = (index, guest) => {
    const isOwner = Boolean(guest?.isAccountOwner);
    const idType =
      guest?.idType ||
      (guest?.guestType === "adult" ? "id_card" : "birth_certificate");
    const id = String(guest?.idNumber || "").trim();

    let documentError = "";

    if (isOwner && idType !== "id_card") {
      documentError = "Chủ tài khoản phải sử dụng CCCD để đồng bộ vào hồ sơ.";
    } else if (!id) {
      documentError = isOwner
        ? "Vui lòng nhập CCCD của chủ tài khoản."
        : "Vui lòng nhập số giấy tờ.";
    } else if (idType === "id_card" && !/^\d{12}$/.test(id)) {
      documentError = "CCCD phải gồm đúng 12 chữ số.";
    } else if (idType === "passport" && !/^[A-Z]\d{7}$/.test(id)) {
      documentError =
        "Số hộ chiếu phải gồm đúng 8 ký tự: 1 chữ cái in hoa đứng đầu và 7 chữ số.";
    } else if (idType === "birth_certificate" && !/^\d{12}$/.test(id)) {
      documentError = "Số giấy khai sinh phải gồm đúng 12 chữ số.";
    } else if (id.length > 50) {
      documentError = "Số giấy tờ tối đa 50 ký tự.";
    }

    setErrors((prev) => {
      const nextErrors = { ...prev };

      if (documentError) {
        nextErrors[`guest-id-format-${index}`] = documentError;
      } else {
        delete nextErrors[`guest-id-format-${index}`];
      }

      return nextErrors;
    });

    const done = !documentError && isGuestDone(guest);

    setValidatedGuestIndexes((prev) => ({
      ...prev,
      [index]: done,
    }));

    return done;
  };

  const validateCurrent = () => {
    const next = {};
    if (step === 0) {
      if (!selectedDeparture) {
        next.departure = "Vui lòng chọn lịch khởi hành.";
      } else if (selectedDepartureConflict) {
        next.departure =
          "Lịch khởi hành này hiện không khả dụng. Vui lòng chọn lịch khác.";
      }
      if (pickupOptions.length > 0 && !pickupPointId)
        next.pickup = "Vui lòng chọn điểm đón.";
      if (bookingPassengers.adultCount < 1)
        next.adult = "Cần ít nhất 1 người lớn.";
      if (totalGuests > remainingSlots)
        next.slots = "Số khách vượt quá số chỗ còn lại.";
    }
    if (step === 1) {
      const contactName = String(contact.contactName || "").trim();
      const contactEmail = String(contact.contactEmail || "")
        .trim()
        .toLowerCase();
      const contactPhone = String(contact.contactPhone || "").trim();

      if (!contactName) {
        next.contactName = "Vui lòng nhập họ và tên người liên hệ.";
      } else if (contactName.length < 2 || contactName.length > 150) {
        next.contactName = "Họ tên liên hệ phải từ 2 đến 150 ký tự.";
      }

      if (!contactPhone) {
        next.contactPhone = "Vui lòng nhập số điện thoại liên hệ.";
      } else if (!contactPhoneLocked && !/^0\d{9}$/.test(contactPhone)) {
        next.contactPhone =
          "Số điện thoại phải gồm đúng 10 chữ số và bắt đầu bằng 0.";
      }

      if (!contactEmail) {
        next.contactEmail = "Vui lòng nhập email liên hệ.";
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
        next.contactEmail = "Email không đúng định dạng.";
      }

      if (String(contact.note || "").length > 1000)
        next.note = "Ghi chú tối đa 1000 ký tự.";
    }
    if (step === 2) {
      const ids = new Set();
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const nextValidatedGuestIndexes = {};

      bookingGuests.forEach((guest, index) => {
        const isOwner = Boolean(guest?.isAccountOwner);
        const guestName = String(guest?.fullName || "").trim();
        const guestDob = String(guest?.dateOfBirth || "").trim();
        const guestGender = String(guest?.gender || "")
          .trim()
          .toLowerCase();
        const idType =
          guest?.idType ||
          (guest?.guestType === "adult" ? "id_card" : "birth_certificate");
        const id = String(guest?.idNumber || "").trim();

        if (!guestName) {
          next[`guest-name-${index}`] = isOwner
            ? "Vui lòng nhập họ và tên chủ tài khoản."
            : "Vui lòng nhập họ và tên hành khách.";
        } else if (guestName.length < 2 || guestName.length > 150) {
          next[`guest-name-${index}`] =
            "Họ tên hành khách phải từ 2 đến 150 ký tự.";
        }

        if (!guestDob) {
          next[`guest-dob-${index}`] = isOwner
            ? "Vui lòng chọn ngày sinh của chủ tài khoản."
            : "Vui lòng chọn ngày sinh hành khách.";
        } else {
          const dob = new Date(`${guestDob}T00:00:00`);
          if (Number.isNaN(dob.getTime()) || dob > today) {
            next[`guest-dob-${index}`] =
              "Ngày sinh không hợp lệ hoặc nằm trong tương lai.";
          }
        }

        if (!guestGender) {
          next[`guest-gender-${index}`] = isOwner
            ? "Vui lòng chọn giới tính của chủ tài khoản."
            : "Vui lòng chọn giới tính hành khách.";
        } else if (!["male", "female", "other"].includes(guestGender)) {
          next[`guest-gender-${index}`] = "Giới tính hành khách không hợp lệ.";
        }

        if (isOwner && idType !== "id_card") {
          next[`guest-id-format-${index}`] =
            "Chủ tài khoản phải sử dụng CCCD để đồng bộ vào hồ sơ.";
        } else if (!id) {
          next[`guest-id-format-${index}`] = isOwner
            ? "Vui lòng nhập CCCD của chủ tài khoản."
            : "Vui lòng nhập số giấy tờ.";
        } else if (idType === "id_card" && !/^\d{12}$/.test(id)) {
          next[`guest-id-format-${index}`] = "CCCD phải gồm đúng 12 chữ số.";
        } else if (idType === "passport" && !/^[A-Z]\d{7}$/.test(id)) {
          next[`guest-id-format-${index}`] =
            "Số hộ chiếu phải gồm đúng 8 ký tự: 1 chữ cái in hoa đứng đầu và 7 chữ số.";
        } else if (idType === "birth_certificate" && !/^\d{12}$/.test(id)) {
          next[`guest-id-format-${index}`] =
            "Số giấy khai sinh phải gồm đúng 12 chữ số.";
        } else if (id.length > 50) {
          next[`guest-id-format-${index}`] = "Số giấy tờ tối đa 50 ký tự.";
        }

        const normalizedId = id.toLowerCase();
        if (id && ids.has(normalizedId)) {
          next[`guest-id-${index}`] =
            "Số giấy tờ bị trùng với hành khách khác trong booking.";
        }
        if (id) ids.add(normalizedId);

        if (!guestName || !guestDob || !guestGender || !id) {
          next[`guest-${index}`] = isOwner
            ? "Vui lòng hoàn thiện đầy đủ thông tin chủ tài khoản."
            : "Vui lòng hoàn thiện đầy đủ thông tin hành khách.";
        }

        nextValidatedGuestIndexes[index] =
          !next[`guest-name-${index}`] &&
          !next[`guest-dob-${index}`] &&
          !next[`guest-gender-${index}`] &&
          !next[`guest-id-format-${index}`] &&
          !next[`guest-id-${index}`] &&
          !next[`guest-${index}`] &&
          isGuestDone(guest);
      });

      setValidatedGuestIndexes(nextValidatedGuestIndexes);
    }
    if (step === 4 && !confirmed)
      next.confirmed = "Bạn cần xác nhận thông tin trước khi thanh toán.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const saveMissingContactToProfile = async () => {
    const payload = {};

    if (!contactNameLocked) {
      payload.fullName = String(contact.contactName || "").trim();
    }
    if (!contactEmailLocked) {
      payload.email = String(contact.contactEmail || "")
        .trim()
        .toLowerCase();
    }
    if (!contactPhoneLocked) {
      payload.phone = String(contact.contactPhone || "").trim();
    }

    if (!Object.keys(payload).length) return true;

    setSavingContactProfile(true);
    try {
      const updatedUser = await apiFetch("/auth/me", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      const nextProfile = {
        fullName: String(
          updatedUser?.fullName || contact.contactName || "",
        ).trim(),
        email: String(updatedUser?.email || contact.contactEmail || "")
          .trim()
          .toLowerCase(),
        phone: String(updatedUser?.phone || contact.contactPhone || "").trim(),
      };

      setProfileContact(nextProfile);
      setContact((prev) => ({
        ...prev,
        contactName: nextProfile.fullName,
        contactEmail: nextProfile.email,
        contactPhone: nextProfile.phone,
      }));

      if (updatedUser) {
        updateStoredUser(updatedUser);
      }

      return true;
    } catch (error) {
      const message =
        error?.message ||
        "Không thể cập nhật thông tin liên hệ vào hồ sơ. Vui lòng thử lại.";

      const normalized = String(message).toLowerCase();

      if (normalized.includes("số điện thoại")) {
        setErrors((prev) => ({ ...prev, contactPhone: message }));
      } else if (normalized.includes("email")) {
        setErrors((prev) => ({ ...prev, contactEmail: message }));
      } else if (
        normalized.includes("họ tên") ||
        normalized.includes("họ và tên")
      ) {
        setErrors((prev) => ({ ...prev, contactName: message }));
      } else {
        setErrors((prev) => ({ ...prev, contactProfile: message }));
      }

      return false;
    } finally {
      setSavingContactProfile(false);
    }
  };

  const saveMissingOwnerToProfile = async () => {
    const ownerIndex = (
      Array.isArray(bookingGuests) ? bookingGuests : []
    ).findIndex((guest) => guest?.isAccountOwner);

    if (ownerIndex < 0) {
      setErrors((prev) => ({
        ...prev,
        ownerProfile:
          "Không tìm thấy thông tin chủ tài khoản trong danh sách hành khách.",
      }));
      return false;
    }

    const ownerGuest = bookingGuests[ownerIndex] || {};
    const payload = {};

    if (!ownerFullNameLocked) {
      payload.fullName = String(ownerGuest.fullName || "").trim();
    }
    if (!ownerBirthDateLocked) {
      payload.birthDate = String(ownerGuest.dateOfBirth || "").trim();
    }
    if (!ownerGenderLocked) {
      payload.gender = String(ownerGuest.gender || "")
        .trim()
        .toLowerCase();
    }
    if (!ownerIdentityLocked) {
      payload.identityNumber = String(ownerGuest.idNumber || "").trim();
    }

    if (!Object.keys(payload).length) return true;

    setSavingOwnerProfile(true);
    try {
      const updatedUser = await apiFetch("/auth/me", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      const nextOwnerProfile = {
        fullName: String(
          updatedUser?.fullName || ownerGuest.fullName || "",
        ).trim(),
        birthDate: updatedUser?.birthDate
          ? String(updatedUser.birthDate).slice(0, 10)
          : String(ownerGuest.dateOfBirth || "").trim(),
        gender: String(updatedUser?.gender || ownerGuest.gender || "")
          .trim()
          .toLowerCase(),
        identityNumber: String(
          updatedUser?.identityNumber || ownerGuest.idNumber || "",
        ).trim(),
      };

      setOwnerProfile(nextOwnerProfile);

      if (updatedUser) {
        updateStoredUser(updatedUser);
      }

      return true;
    } catch (error) {
      const message =
        error?.message ||
        "Không thể cập nhật thông tin chủ tài khoản vào hồ sơ. Vui lòng thử lại.";
      const normalized = String(message).toLowerCase();

      if (
        normalized.includes("cccd") ||
        normalized.includes("căn cước") ||
        normalized.includes("identity")
      ) {
        setErrors((prev) => ({
          ...prev,
          [`guest-id-format-${ownerIndex}`]: message,
        }));
      } else if (normalized.includes("ngày sinh")) {
        setErrors((prev) => ({
          ...prev,
          [`guest-dob-${ownerIndex}`]: message,
        }));
      } else if (normalized.includes("giới tính")) {
        setErrors((prev) => ({
          ...prev,
          [`guest-gender-${ownerIndex}`]: message,
        }));
      } else if (
        normalized.includes("họ tên") ||
        normalized.includes("họ và tên")
      ) {
        setErrors((prev) => ({
          ...prev,
          [`guest-name-${ownerIndex}`]: message,
        }));
      } else {
        setErrors((prev) => ({ ...prev, ownerProfile: message }));
      }

      return false;
    } finally {
      setSavingOwnerProfile(false);
    }
  };

  const nextStep = async () => {
    if (!validateCurrent()) return;

    if (step === 1) {
      const saved = await saveMissingContactToProfile();
      if (!saved) return;
    }

    if (step === 2) {
      const saved = await saveMissingOwnerToProfile();
      if (!saved) return;
    }

    setStep((value) => Math.min(value + 1, steps.length - 1));
  };

  const previousStep = () => setStep((value) => Math.max(value - 1, 0));

  return (
    <div onClick={onClose} style={overlay}>
      <form
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          if (!validateCurrent()) {
            event.preventDefault();
            return;
          }
          onSubmit(event);
        }}
        style={shell}
      >
        <input
          type="hidden"
          name="departureId"
          value={selectedDepartureId || tour?.departures?.[0]?.id || ""}
        />
        <input
          type="hidden"
          name="adultCount"
          value={bookingPassengers.adultCount}
        />
        <input
          type="hidden"
          name="childCount"
          value={bookingPassengers.childCount}
        />
        <input type="hidden" name="pickupPointId" value={pickupPointId} />
        <input
          type="hidden"
          name="voucherCode"
          value={selectedVoucherCode || ""}
        />
        {Object.entries(contact).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}

        <header style={header}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              minWidth: 0,
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 16,
                background: "#ecfdf5",
                color: "#10b981",
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
                fontSize: 22,
              }}
              aria-hidden="true"
            >
              ✈
            </div>

            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                  marginBottom: 6,
                }}
              >
                <strong
                  style={{
                    color: "#059669",
                    textTransform: "uppercase",
                    fontSize: 11,
                    letterSpacing: "0.75px",
                    fontWeight: 800,
                  }}
                >
                  Đặt tour trực tuyến
                </strong>
              </div>

              <h2
                style={{
                  margin: 0,
                  color: "#0f172a",
                  fontSize: "1.55rem",
                  fontWeight: 800,
                  lineHeight: 1.25,
                }}
              >
                Hoàn tất thủ tục đặt tour
              </h2>

              <p
                style={{
                  margin: "6px 0 0",
                  color: "#64748b",
                  fontSize: "0.9rem",
                  lineHeight: 1.5,
                }}
              >
                Chỗ được giữ tự động trong 15 phút sau khi tạo mã thanh toán.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng cửa sổ đặt tour"
            style={closeBtn}
          >
            ✕
          </button>
        </header>

        <nav style={progress}>
          {steps.map(([key, title], index) => {
            const done = index < step;
            const active = index === step;
            return (
              <button
                key={key}
                type="button"
                onClick={() => index < step && setStep(index)}
                style={{ ...stepPill, opacity: done || active ? 1 : 0.6 }}
              >
                <span
                  style={{
                    ...stepDot,
                    background: done
                      ? "#10b981"
                      : active
                        ? "#10b981"
                        : "#e2e8f0",
                    color: done || active ? "#fff" : "#64748b",
                  }}
                >
                  {done ? "✓" : index + 1}
                </span>
                <span
                  style={{
                    fontWeight: active ? 700 : 600,
                    color: active ? "#0f172a" : "#475569",
                  }}
                >
                  {title}
                </span>
              </button>
            );
          })}
        </nav>

        <main style={body}>
          <div style={contentWrapper}>
            <section style={mainContent}>
              <div style={{ marginBottom: 24 }}>
                <h3 style={title}>{steps[step][1]}</h3>
                <p style={desc}>{steps[step][2]}</p>
              </div>

              {step === 0 && (
                <div style={{ display: "grid", gap: 24 }}>
                  <div style={grid2}>
                    <Field
                      label="Lịch khởi hành"
                      required
                      error={errors.departure}
                    >
                      <select
                        style={inputStyle}
                        value={
                          selectedDepartureId || tour?.departures?.[0]?.id || ""
                        }
                        onChange={handleDepartureChange}
                      >
                        {(tour.departures || []).map((item) => {
                          const remaining = getDepartureRemainingSlots(item);
                          const conflict = findDepartureConflict(
                            item,
                            activeBookingPeriods,
                          );
                          const disabled = remaining <= 0 || Boolean(conflict);

                          return (
                            <option
                              key={item.id}
                              value={item.id}
                              disabled={disabled}
                            >
                              {formatDate(item.departureDate)} -{" "}
                              {formatCurrency(item.adultPrice)} - còn{" "}
                              {remaining} chỗ
                              {remaining <= 0 ? " - Hết chỗ" : ""}
                            </option>
                          );
                        })}
                      </select>
                    </Field>
                    <Field
                      label="Điểm đón"
                      required={pickupOptions.length > 0}
                      error={errors.pickup}
                    >
                      <select
                        style={inputStyle}
                        value={pickupPointId}
                        onChange={(event) =>
                          setPickupPointId(event.target.value)
                        }
                      >
                        <option value="">Chọn điểm đón</option>
                        {pickupOptions.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.province} - {item.name} -{" "}
                            {formatPickupTime(item.pickupTime)}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>

                  <div style={grid2}>
                    <Stepper
                      label="Người lớn"
                      value={bookingPassengers.adultCount}
                      min={1}
                      onChange={(value) => setPassenger("adultCount", value)}
                    />
                    <Stepper
                      label="Trẻ em"
                      value={bookingPassengers.childCount}
                      min={0}
                      onChange={(value) => setPassenger("childCount", value)}
                    />
                  </div>

                  {errors.slots ? (
                    <div
                      style={{
                        padding: 12,
                        background: "#fef2f2",
                        color: "#b91c1c",
                        borderRadius: 8,
                        fontSize: "0.9rem",
                        fontWeight: 600,
                      }}
                    >
                      ⚠ {errors.slots}
                    </div>
                  ) : null}
                </div>
              )}

              {step === 1 && (
                <div style={{ display: "grid", gap: 20 }}>
                  <div style={grid2}>
                    <Field
                      label="Họ và tên"
                      required
                      error={errors.contactName}
                    >
                      <input
                        style={{
                          ...inputStyle,
                          background: contactNameLocked ? "#f1f5f9" : "#ffffff",
                          color: contactNameLocked ? "#64748b" : "#0f172a",
                          cursor: contactNameLocked ? "not-allowed" : "text",
                        }}
                        placeholder="Vd: Nguyễn Văn A"
                        value={contact.contactName}
                        readOnly={contactNameLocked}
                        onChange={
                          contactNameLocked
                            ? undefined
                            : (e) =>
                                setContact({
                                  ...contact,
                                  contactName: e.target.value,
                                })
                        }
                      />
                    </Field>
                    <Field
                      label="Số điện thoại"
                      required
                      error={errors.contactPhone}
                    >
                      <input
                        style={{
                          ...inputStyle,
                          background: contactPhoneLocked
                            ? "#f1f5f9"
                            : "#ffffff",
                          color: contactPhoneLocked ? "#64748b" : "#0f172a",
                          cursor: contactPhoneLocked ? "not-allowed" : "text",
                        }}
                        type="text"
                        inputMode="numeric"
                        maxLength={contactPhoneLocked ? undefined : 10}
                        placeholder="Vd: 0901234567"
                        value={contact.contactPhone}
                        readOnly={contactPhoneLocked}
                        onChange={
                          contactPhoneLocked
                            ? undefined
                            : (e) =>
                                setContact({
                                  ...contact,
                                  contactPhone: e.target.value
                                    .replace(/\D/g, "")
                                    .slice(0, 10),
                                })
                        }
                      />
                    </Field>
                  </div>
                  <Field
                    label="Email xác nhận"
                    required
                    error={errors.contactEmail}
                  >
                    <input
                      style={{
                        ...inputStyle,
                        background: contactEmailLocked ? "#f1f5f9" : "#ffffff",
                        color: contactEmailLocked ? "#64748b" : "#0f172a",
                        cursor: contactEmailLocked ? "not-allowed" : "text",
                      }}
                      type="email"
                      placeholder="Địa chỉ email nhận vé"
                      value={contact.contactEmail}
                      readOnly={contactEmailLocked}
                      onChange={
                        contactEmailLocked
                          ? undefined
                          : (e) =>
                              setContact({
                                ...contact,
                                contactEmail: e.target.value,
                              })
                      }
                    />
                  </Field>
                  <Field
                    label="Yêu cầu đặc biệt (không bắt buộc)"
                    error={errors.note}
                  >
                    <textarea
                      style={{ ...inputStyle, resize: "vertical" }}
                      rows={3}
                      placeholder="Ghi chú về dị ứng thức ăn, yêu cầu hỗ trợ..."
                      value={contact.note}
                      onChange={(e) =>
                        setContact({ ...contact, note: e.target.value })
                      }
                    />
                  </Field>

                  {errors.contactProfile ? (
                    <small style={{ color: "#ef4444", fontWeight: 600 }}>
                      {errors.contactProfile}
                    </small>
                  ) : null}
                </div>
              )}

              {step === 2 && (
                <div style={{ display: "grid", gap: 16 }}>
                  {bookingGuests.map((guest, index) => (
                    <details
                      key={`${guest.guestType}-${guest.index}`}
                      open={
                        index === 0 || validatedGuestIndexes[index] !== true
                      }
                      style={guestCard}
                    >
                      <summary
                        style={{
                          cursor: "pointer",
                          fontWeight: 700,
                          color: "#0f172a",
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          userSelect: "none",
                        }}
                      >
                        <div
                          style={{
                            flex: 1,
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          {guest.guestType === "adult" ? "Người lớn" : "Trẻ em"}{" "}
                          {guest.index + 1}
                          {guest.isAccountOwner && (
                            <Badge tone="blue">Người đặt tour</Badge>
                          )}
                        </div>
                        <Badge
                          tone={
                            validatedGuestIndexes[index] === true
                              ? "green"
                              : "amber"
                          }
                        >
                          {validatedGuestIndexes[index] === true
                            ? "✓ Đã đủ thông tin"
                            : "⚠ Cần hoàn thiện"}
                        </Badge>
                      </summary>

                      <div
                        style={{
                          display: "grid",
                          gap: 16,
                          marginTop: 20,
                          paddingTop: 16,
                          borderTop: "1px dashed #e2e8f0",
                        }}
                      >
                        {!guest.isAccountOwner &&
                        getAvailableSavedTravelers(guest, index).length > 0 ? (
                          <div
                            style={{
                              background: "#f8fafc",
                              padding: 16,
                              borderRadius: 12,
                            }}
                          >
                            <Field label="Chọn từ hành khách đã lưu">
                              <select
                                style={inputStyle}
                                value={guest.savedTravelerId || ""}
                                onChange={handleSavedTravelerSelect(index)}
                              >
                                <option value="">+ Nhập thông tin mới</option>
                                {getAvailableSavedTravelers(guest, index).map(
                                  (item) => (
                                    <option key={item.id} value={item.id}>
                                      {item.fullName}
                                    </option>
                                  ),
                                )}
                              </select>
                            </Field>
                          </div>
                        ) : null}
                        <div style={grid2}>
                          <Field
                            label="Họ và tên đúng giấy tờ"
                            required
                            error={errors[`guest-name-${index}`]}
                          >
                            <input
                              style={{
                                ...inputStyle,
                                background:
                                  guest.isAccountOwner && ownerFullNameLocked
                                    ? "#f1f5f9"
                                    : "#ffffff",
                                color:
                                  guest.isAccountOwner && ownerFullNameLocked
                                    ? "#64748b"
                                    : "#0f172a",
                                cursor:
                                  guest.isAccountOwner && ownerFullNameLocked
                                    ? "not-allowed"
                                    : "text",
                              }}
                              value={guest.fullName || ""}
                              readOnly={
                                guest.isAccountOwner && ownerFullNameLocked
                              }
                              onChange={
                                guest.isAccountOwner && ownerFullNameLocked
                                  ? undefined
                                  : handleGuestChange(index, "fullName")
                              }
                            />
                          </Field>
                          <Field
                            label="Ngày sinh"
                            required
                            error={errors[`guest-dob-${index}`]}
                          >
                            <input
                              style={{
                                ...inputStyle,
                                background:
                                  guest.isAccountOwner && ownerBirthDateLocked
                                    ? "#f1f5f9"
                                    : "#ffffff",
                                color:
                                  guest.isAccountOwner && ownerBirthDateLocked
                                    ? "#64748b"
                                    : "#0f172a",
                                cursor:
                                  guest.isAccountOwner && ownerBirthDateLocked
                                    ? "not-allowed"
                                    : "text",
                              }}
                              type="date"
                              value={guest.dateOfBirth || ""}
                              readOnly={
                                guest.isAccountOwner && ownerBirthDateLocked
                              }
                              onChange={
                                guest.isAccountOwner && ownerBirthDateLocked
                                  ? undefined
                                  : handleGuestChange(index, "dateOfBirth")
                              }
                            />
                          </Field>
                          <Field
                            label="Giới tính"
                            required
                            error={errors[`guest-gender-${index}`]}
                          >
                            <select
                              style={{
                                ...inputStyle,
                                background:
                                  guest.isAccountOwner && ownerGenderLocked
                                    ? "#f1f5f9"
                                    : "#ffffff",
                                color:
                                  guest.isAccountOwner && ownerGenderLocked
                                    ? "#64748b"
                                    : "#0f172a",
                                cursor:
                                  guest.isAccountOwner && ownerGenderLocked
                                    ? "not-allowed"
                                    : "pointer",
                              }}
                              value={guest.gender || ""}
                              disabled={
                                guest.isAccountOwner && ownerGenderLocked
                              }
                              onChange={handleGuestChange(index, "gender")}
                            >
                              <option value="">Chọn giới tính</option>
                              <option value="male">Nam</option>
                              <option value="female">Nữ</option>
                              <option value="other">Khác</option>
                            </select>
                          </Field>
                          <Field label="Loại giấy tờ" required>
                            <select
                              style={{
                                ...inputStyle,
                                background: guest.isAccountOwner
                                  ? "#f1f5f9"
                                  : "#ffffff",
                                color: guest.isAccountOwner
                                  ? "#64748b"
                                  : "#0f172a",
                                cursor: guest.isAccountOwner
                                  ? "not-allowed"
                                  : "pointer",
                              }}
                              value={
                                guest.isAccountOwner
                                  ? "id_card"
                                  : guest.idType ||
                                    (guest.guestType === "adult"
                                      ? "id_card"
                                      : "birth_certificate")
                              }
                              disabled={guest.isAccountOwner}
                              onChange={
                                guest.isAccountOwner
                                  ? undefined
                                  : (event) => {
                                      setValidatedGuestIndexes((prev) => ({
                                        ...prev,
                                        [index]: false,
                                      }));
                                      handleGuestChange(index, "idType")(event);
                                    }
                              }
                            >
                              <option value="id_card">CCCD / CMND</option>
                              <option value="passport">Hộ chiếu</option>
                              <option value="birth_certificate">
                                Giấy khai sinh
                              </option>
                            </select>
                          </Field>
                          <Field
                            label="Số giấy tờ"
                            required
                            error={
                              errors[`guest-id-format-${index}`] ||
                              errors[`guest-id-${index}`]
                            }
                          >
                            <input
                              style={{
                                ...inputStyle,
                                background:
                                  guest.isAccountOwner && ownerIdentityLocked
                                    ? "#f1f5f9"
                                    : "#ffffff",
                                color:
                                  guest.isAccountOwner && ownerIdentityLocked
                                    ? "#64748b"
                                    : "#0f172a",
                                cursor:
                                  guest.isAccountOwner && ownerIdentityLocked
                                    ? "not-allowed"
                                    : "text",
                              }}
                              inputMode={
                                guest.isAccountOwner ||
                                (guest.idType || "") === "id_card" ||
                                (guest.idType || "") === "birth_certificate"
                                  ? "numeric"
                                  : undefined
                              }
                              maxLength={
                                guest.isAccountOwner ||
                                (guest.idType || "") === "id_card" ||
                                (guest.idType || "") === "birth_certificate"
                                  ? 12
                                  : (guest.idType || "") === "passport"
                                    ? 8
                                    : 50
                              }
                              value={guest.idNumber || ""}
                              readOnly={
                                guest.isAccountOwner && ownerIdentityLocked
                              }
                              onChange={
                                guest.isAccountOwner && ownerIdentityLocked
                                  ? undefined
                                  : (event) => {
                                      const currentIdType = guest.isAccountOwner
                                        ? "id_card"
                                        : guest.idType ||
                                          (guest.guestType === "adult"
                                            ? "id_card"
                                            : "birth_certificate");
                                      const rawValue = event.target.value;
                                      const value =
                                        currentIdType === "id_card" ||
                                        currentIdType === "birth_certificate"
                                          ? rawValue
                                              .replace(/\D/g, "")
                                              .slice(0, 12)
                                          : currentIdType === "passport"
                                            ? rawValue
                                                .toUpperCase()
                                                .replace(/[^A-Z0-9]/g, "")
                                                .slice(0, 8)
                                            : rawValue.slice(0, 50);

                                      setValidatedGuestIndexes((prev) => ({
                                        ...prev,
                                        [index]: false,
                                      }));

                                      handleGuestChange(
                                        index,
                                        "idNumber",
                                      )({
                                        target: { value },
                                      });
                                    }
                              }
                              onKeyDown={
                                guest.isAccountOwner && ownerIdentityLocked
                                  ? undefined
                                  : (event) => {
                                      if (event.key !== "Enter") return;

                                      event.preventDefault();

                                      const currentGuest = {
                                        ...guest,
                                        idNumber: event.currentTarget.value,
                                      };

                                      validateGuestDocumentOnDemand(
                                        index,
                                        currentGuest,
                                      );
                                    }
                              }
                            />
                          </Field>
                          <Field label="Quốc tịch">
                            <input
                              defaultValue="Việt Nam"
                              disabled
                              style={{
                                ...inputStyle,
                                background: "#f1f5f9",
                                color: "#64748b",
                                cursor: "not-allowed",
                              }}
                            />
                          </Field>
                        </div>
                        {errors[`guest-${index}`] ? (
                          <small style={{ color: "#ef4444", fontWeight: 500 }}>
                            {errors[`guest-${index}`]}
                          </small>
                        ) : null}
                      </div>
                    </details>
                  ))}

                  {errors.ownerProfile ? (
                    <small style={{ color: "#ef4444", fontWeight: 600 }}>
                      {errors.ownerProfile}
                    </small>
                  ) : null}
                </div>
              )}

              {step === 3 && (
                <div style={{ display: "grid", gap: 16 }}>
                  <h4
                    style={{
                      margin: "0 0 8px",
                      fontSize: "1rem",
                      color: "#334155",
                    }}
                  >
                    Mã giảm giá khả dụng
                  </h4>
                  <VoucherCard
                    checked={!selectedVoucherCode}
                    onChange={() => setSelectedVoucherCode("")}
                    title="Không sử dụng mã giảm giá"
                  />

                  {availableVouchers.length === 0 && (
                    <p
                      style={{
                        color: "#64748b",
                        fontStyle: "italic",
                        fontSize: "0.9rem",
                      }}
                    >
                      Hiện chưa có mã giảm giá nào cho tour này.
                    </p>
                  )}

                  {availableVouchers.map((voucher) => {
                    const minOrder = Number(voucher.minOrderAmount || 0);
                    const disabled = Number(preview?.total || 0) < minOrder;
                    const discount = estimateVoucherDiscount(
                      voucher,
                      preview?.total,
                    );
                    return (
                      <VoucherCard
                        key={`${voucher.userVoucherId || voucher.id}-${voucher.code}`}
                        checked={
                          String(selectedVoucherCode) === String(voucher.code)
                        }
                        disabled={disabled}
                        onChange={() => setSelectedVoucherCode(voucher.code)}
                        title={voucher.code}
                        subtitle={voucher.name}
                        meta={`${formatVoucherDiscount(voucher)} • Đơn tối thiểu ${formatCurrency(minOrder)}${voucher.endDate ? ` • HSD: ${formatDate(voucher.endDate)}` : ""}`}
                        highlight={
                          !disabled
                            ? `Dự kiến giảm ${formatCurrency(discount)}`
                            : "Chưa đủ điều kiện"
                        }
                      />
                    );
                  })}
                </div>
              )}

              {step === 4 && (
                <div style={{ display: "grid", gap: 24 }}>
                  <div
                    style={{
                      background: "#f8fafc",
                      padding: 20,
                      borderRadius: 16,
                      border: "1px solid #e2e8f0",
                    }}
                  >
                    <h4
                      style={{
                        margin: "0 0 16px",
                        color: "#0f172a",
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <span style={{ fontSize: "1.2rem" }}>📝</span> Kiểm tra
                      thông tin
                    </h4>
                    <Summary
                      rows={[
                        [
                          "Tên Tour",
                          <strong key="tourName" style={{ color: "#0f172a" }}>
                            {tour.name}
                          </strong>,
                        ],
                        [
                          "Ngày khởi hành",
                          selectedDeparture
                            ? formatDate(selectedDeparture.departureDate)
                            : "-",
                        ],
                        [
                          "Điểm đón",
                          pickupOptions.find(
                            (item) => String(item.id) === String(pickupPointId),
                          )?.name || "-",
                        ],
                        [
                          "Số lượng khách",
                          `${bookingPassengers.adultCount} Người lớn, ${bookingPassengers.childCount} Trẻ em`,
                        ],
                      ]}
                    />
                  </div>

                  <div>
                    <h4
                      style={{
                        margin: "0 0 12px",
                        color: "#0f172a",
                        fontSize: "1rem",
                      }}
                    >
                      Danh sách hành khách
                    </h4>
                    <div style={{ display: "grid", gap: 8 }}>
                      {bookingGuests.map((guest, idx) => (
                        <div
                          key={`${guest.guestType}-${guest.index}`}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            padding: "12px 16px",
                            background: "#ffffff",
                            border: "1px solid #e2e8f0",
                            borderRadius: 8,
                          }}
                        >
                          <span style={{ fontWeight: 600, color: "#334155" }}>
                            {idx + 1}. {guest.fullName}
                          </span>
                          <span style={{ color: "#64748b" }}>
                            {guest.idNumber}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <label
                    style={{
                      display: "flex",
                      gap: 12,
                      alignItems: "flex-start",
                      padding: 16,
                      background: confirmed ? "#ecfdf5" : "#f8fafc",
                      border: `1px solid ${confirmed ? "#10b981" : "#e2e8f0"}`,
                      borderRadius: 12,
                      cursor: "pointer",
                      transition: "all 0.2s",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                      style={{
                        width: 20,
                        height: 20,
                        marginTop: 2,
                        accentColor: "#10b981",
                      }}
                    />
                    <span
                      style={{
                        color: "#334155",
                        fontSize: "0.95rem",
                        lineHeight: "1.5",
                      }}
                    >
                      Tôi xác nhận các thông tin đặt tour trên là chính xác và
                      đồng ý với các <strong>điều khoản & chính sách</strong>{" "}
                      của Travela. Booking sẽ được giữ chỗ tự động trong{" "}
                      <strong>15 phút</strong> chờ thanh toán.
                    </span>
                  </label>
                  {errors.confirmed ? (
                    <small
                      style={{
                        color: "#ef4444",
                        fontWeight: 600,
                        marginTop: "-16px",
                      }}
                    >
                      {errors.confirmed}
                    </small>
                  ) : null}
                </div>
              )}
            </section>

            {/* Cột Tóm tắt chi phí (Sticky Sidebar) */}
            <aside
              style={{ display: "flex", flexDirection: "column", gap: 16 }}
            >
              {step === 0 && selectedDeparture && (
                <div style={summaryCard}>
                  <h4
                    style={{
                      margin: "0 0 16px",
                      color: "#0f172a",
                      fontSize: "1.1rem",
                    }}
                  >
                    Thông tin vé
                  </h4>
                  <Summary
                    rows={[
                      [
                        "Người lớn",
                        formatCurrency(selectedDeparture.adultPrice),
                      ],
                      ["Trẻ em", formatCurrency(selectedDeparture.childPrice)],
                      [
                        "Số chỗ còn nhận",
                        <span
                          key="slots"
                          style={{ color: "#10b981", fontWeight: 700 }}
                        >
                          {remainingSlots} chỗ
                        </span>,
                      ],
                    ]}
                  />
                </div>
              )}
              <CostSummary
                preview={preview}
                bookingPassengers={bookingPassengers}
                selectedVoucher={selectedVoucher}
                selectedVoucherDiscount={selectedVoucherDiscount}
                finalAmount={finalAmount}
              />
            </aside>
          </div>
        </main>

        <footer style={footer}>
          <button
            type="button"
            onClick={previousStep}
            disabled={step === 0}
            style={{
              ...secondaryBtn,
              opacity: step === 0 ? 0 : 1,
              pointerEvents: step === 0 ? "none" : "auto",
            }}
          >
            Quay lại
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div
              style={{
                textAlign: "right",
                display: step === 4 ? "block" : "none",
              }}
            >
              <div style={{ fontSize: "0.85rem", color: "#64748b" }}>
                Tổng thanh toán
              </div>
              <div
                style={{
                  fontSize: "1.25rem",
                  fontWeight: 800,
                  color: "#10b981",
                }}
              >
                {formatCurrency(finalAmount)}
              </div>
            </div>
            {step < steps.length - 1 ? (
              <button
                type="button"
                onClick={nextStep}
                disabled={
                  (step === 1 && savingContactProfile) ||
                  (step === 2 && savingOwnerProfile)
                }
                style={{
                  ...primaryBtn,
                  opacity:
                    (step === 1 && savingContactProfile) ||
                    (step === 2 && savingOwnerProfile)
                      ? 0.7
                      : 1,
                  cursor:
                    (step === 1 && savingContactProfile) ||
                    (step === 2 && savingOwnerProfile)
                      ? "not-allowed"
                      : "pointer",
                }}
              >
                Tiếp tục
              </button>
            ) : (
              <button type="submit" style={primaryBtn}>
                Thanh toán ngay
              </button>
            )}
          </div>
        </footer>
      </form>
    </div>
  );
}

// Sub-components
function Badge({ children, tone = "slate" }) {
  const themes = {
    green: { bg: "#dcfce7", color: "#166534" },
    amber: { bg: "#fef3c7", color: "#92400e" },
    blue: { bg: "#dbeafe", color: "#1e40af" },
    slate: { bg: "#f1f5f9", color: "#475569" },
  };
  const theme = themes[tone] || themes.slate;

  return (
    <span
      style={{
        padding: "4px 10px",
        borderRadius: 6,
        background: theme.bg,
        color: theme.color,
        fontSize: "0.75rem",
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function Summary({ rows }) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {rows.map(([label, value], idx) => (
        <div
          key={idx}
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            fontSize: "0.95rem",
          }}
        >
          <span style={{ color: "#64748b" }}>{label}</span>
          <span
            style={{ color: "#0f172a", fontWeight: 600, textAlign: "right" }}
          >
            {value}
          </span>
        </div>
      ))}
    </div>
  );
}

function VoucherCard({
  checked,
  disabled,
  onChange,
  title,
  subtitle,
  meta,
  highlight,
}) {
  return (
    <label
      style={{
        ...guestCard,
        display: "flex",
        gap: 16,
        opacity: disabled ? 0.6 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        borderColor: checked ? "#10b981" : "#e2e8f0",
        background: checked ? "#f0fdf4" : "#ffffff",
        boxShadow: checked
          ? "0 4px 12px rgba(16, 185, 129, 0.1)"
          : "0 2px 4px rgba(0,0,0,0.02)",
      }}
    >
      <input
        type="radio"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        style={{ width: 20, height: 20, accentColor: "#10b981", marginTop: 2 }}
      />
      <div style={{ flex: 1 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
          }}
        >
          <strong>{title}</strong>
          {highlight && (
            <Badge tone={disabled ? "slate" : "green"}>{highlight}</Badge>
          )}
        </div>
        {subtitle && (
          <div
            style={{
              color: "#0f172a",
              fontSize: "0.9rem",
              marginTop: 4,
              fontWeight: 500,
            }}
          >
            {subtitle}
          </div>
        )}
        {meta && (
          <p
            style={{ margin: "6px 0 0", color: "#64748b", fontSize: "0.85rem" }}
          >
            {meta}
          </p>
        )}
      </div>
    </label>
  );
}

function CostSummary({
  preview,
  bookingPassengers,
  selectedVoucher,
  selectedVoucherDiscount,
  finalAmount,
}) {
  return (
    <div style={{ ...summaryCard, position: "sticky", top: 0 }}>
      <h4
        style={{
          margin: "0 0 20px",
          color: "#0f172a",
          fontSize: "1.1rem",
          paddingBottom: 12,
          borderBottom: "1px solid #e2e8f0",
        }}
      >
        Chi tiết thanh toán
      </h4>
      <div style={{ display: "grid", gap: 16, marginBottom: 20 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: "0.95rem",
          }}
        >
          <span style={{ color: "#64748b" }}>
            Vé người lớn (x{bookingPassengers.adultCount})
          </span>
          <span style={{ fontWeight: 600, color: "#0f172a" }}>-</span>
        </div>
        {bookingPassengers.childCount > 0 && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "0.95rem",
            }}
          >
            <span style={{ color: "#64748b" }}>
              Vé trẻ em (x{bookingPassengers.childCount})
            </span>
            <span style={{ fontWeight: 600, color: "#0f172a" }}>-</span>
          </div>
        )}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: "0.95rem",
          }}
        >
          <span style={{ color: "#64748b" }}>Tạm tính</span>
          <span style={{ fontWeight: 600, color: "#0f172a" }}>
            {formatCurrency(preview?.total || 0)}
          </span>
        </div>
        {selectedVoucher && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "0.95rem",
              color: "#10b981",
            }}
          >
            <span>Mã giảm giá ({selectedVoucher.code})</span>
            <span style={{ fontWeight: 600 }}>
              -{formatCurrency(selectedVoucherDiscount)}
            </span>
          </div>
        )}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          paddingTop: 16,
          borderTop: "1px dashed #cbd5e1",
        }}
      >
        <span style={{ color: "#0f172a", fontWeight: 700 }}>Tổng tiền</span>
        <span
          style={{ fontSize: "1.35rem", fontWeight: 800, color: "#10b981" }}
        >
          {formatCurrency(finalAmount)}
        </span>
      </div>
    </div>
  );
}

// -----------------------------------------------------
// STYLES OBJECTS
// -----------------------------------------------------

const overlay = {
  position: "fixed",
  inset: 0,
  zIndex: 1000,
  background: "rgba(15, 23, 42, 0.58)",
  // Chừa khoảng trống phía trên để modal không dính sát thanh header.
  padding: "104px 20px 28px",
  overflowY: "auto",
  overflowX: "hidden",
  backdropFilter: "blur(5px)",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
};
const shell = {
  width: "100%",
  maxWidth: 1000,
  margin: "0 auto",
  background: "#ffffff",
  borderRadius: 24,
  display: "flex",
  flexDirection: "column",
  minHeight: 620,
  // Trừ cả chiều cao header và khoảng cách trên/dưới của overlay.
  maxHeight: "calc(100vh - 132px)",
  overflow: "hidden",
  boxShadow: "0 28px 80px rgba(15, 23, 42, 0.32)",
  border: "1px solid rgba(255, 255, 255, 0.45)",
};
const header = {
  padding: "24px 30px 22px",
  background: "#ffffff",
  borderBottom: "1px solid #eef2f7",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 20,
  flexShrink: 0,
};
const closeBtn = {
  width: 36,
  height: 36,
  borderRadius: "50%",
  border: "none",
  background: "#f1f5f9",
  cursor: "pointer",
  fontWeight: 600,
  color: "#475569",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  transition: "background 0.2s",
};
const progress = {
  padding: "18px 30px",
  display: "flex",
  gap: 12,
  background: "#f8fafc",
  borderBottom: "1px solid #e2e8f0",
  overflowX: "auto",
  flexShrink: 0,
};
const stepPill = {
  flex: 1,
  minWidth: 140,
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "12px",
  borderRadius: 12,
  border: "none",
  background: "transparent",
  cursor: "pointer",
  transition: "all 0.2s",
};
const stepDot = {
  width: 28,
  height: 28,
  borderRadius: "50%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  fontSize: "0.85rem",
  fontWeight: 700,
};
const body = {
  overflow: "auto",
  padding: "32px",
  background: "#f1f5f9",
  flex: 1,
};
const contentWrapper = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 340px",
  gap: 24,
  alignItems: "start",
};
const mainContent = {
  background: "#ffffff",
  borderRadius: 20,
  padding: 32,
  boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03)",
  border: "1px solid #e2e8f0",
};
const title = {
  margin: 0,
  color: "#0f172a",
  fontSize: "1.5rem",
  fontWeight: 800,
};
const desc = { margin: "8px 0 0", color: "#64748b", fontSize: "0.95rem" };
const grid2 = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 20,
};
const guestCard = {
  padding: 20,
  borderRadius: 16,
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
};
const summaryCard = {
  padding: 24,
  borderRadius: 16,
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)",
};
const footer = {
  padding: "20px 32px",
  borderTop: "1px solid #e2e8f0",
  background: "#ffffff",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  borderRadius: "0 0 24px 24px",
};
const primaryBtn = {
  padding: "14px 28px",
  borderRadius: 12,
  border: "none",
  background: "#10b981",
  color: "#fff",
  fontWeight: 700,
  fontSize: "1rem",
  cursor: "pointer",
  boxShadow: "0 4px 12px rgba(16,185,129,0.3)",
  transition: "all 0.2s",
};
const secondaryBtn = {
  padding: "14px 28px",
  borderRadius: 12,
  border: "1px solid #cbd5e1",
  background: "#ffffff",
  color: "#334155",
  fontWeight: 700,
  fontSize: "1rem",
  cursor: "pointer",
  transition: "all 0.2s",
};
