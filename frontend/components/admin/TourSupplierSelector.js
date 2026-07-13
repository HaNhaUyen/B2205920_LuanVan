import { Building2, ChevronDown, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

const TYPE_LABELS = {
  hotel: "Khách sạn",
  transport: "Vận chuyển",
  restaurant: "Nhà hàng",
  attraction: "Điểm tham quan",
  insurance: "Bảo hiểm",
  medical: "Y tế",
  other: "Khác",
};

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .trim();
}

function supplierTypeOf(item) {
  return String(
    item?.supplierType ||
      item?.supplier_type ||
      item?.type ||
      item?.serviceType ||
      item?.service_type ||
      "other",
  ).toLowerCase();
}

export default function TourSupplierSelector({
  suppliers = [],
  supplierType = "",
  value = "",
  onChange,
  label = "Nhà cung cấp",
  placeholder = "Chọn nhà cung cấp",
  allowManual = true,
  disabled = false,
}) {
  const rootRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState("");

  useEffect(() => {
    const handleOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const activeSuppliers = useMemo(() => {
    const query = normalize(keyword);

    return (suppliers || []).filter((item) => {
      const status = String(item?.status || "active").toLowerCase();
      const type = supplierTypeOf(item);

      const typeMatched =
        !supplierType ||
        type === supplierType ||
        (supplierType === "hotel" &&
          ["hotel", "accommodation", "lodging"].includes(type)) ||
        (supplierType === "transport" &&
          ["transport", "vehicle", "transportation"].includes(type));

      const searchMatched =
        !query ||
        [
          item?.name,
          item?.phone,
          item?.email,
          item?.address,
          item?.province,
          item?.city,
        ].some((field) => normalize(field).includes(query));

      return status === "active" && typeMatched && searchMatched;
    });
  }, [suppliers, supplierType, keyword]);

  const selected = useMemo(
    () =>
      value && value !== "manual"
        ? (suppliers || []).find((item) => String(item.id) === String(value))
        : null,
    [suppliers, value],
  );

  const chooseSupplier = (supplier) => {
    onChange?.({
      supplierId: String(supplier.id),
      supplier,
      isManual: false,
    });
    setKeyword("");
    setOpen(false);
  };

  const chooseManual = () => {
    onChange?.({
      supplierId: "",
      supplier: null,
      isManual: true,
    });
    setKeyword("");
    setOpen(false);
  };

  return (
    <div className="supplier-selector" ref={rootRef}>
      <label className="supplier-selector-label">{label}</label>

      <button
        type="button"
        className={`supplier-selector-trigger ${open ? "is-open" : ""}`}
        onClick={() => !disabled && setOpen((current) => !current)}
        disabled={disabled}
      >
        <span className="supplier-selector-main">
          <span className="supplier-selector-icon">
            <Building2 size={18} />
          </span>

          <span className="supplier-selector-text">
            <strong>
              {selected?.name ||
                (value === "manual" ? "Nhập thông tin thủ công" : placeholder)}
            </strong>

            {selected ? (
              <small>
                {TYPE_LABELS[supplierTypeOf(selected)] || "Nhà cung cấp"}
                {selected.province || selected.city
                  ? ` · ${selected.province || selected.city}`
                  : ""}
              </small>
            ) : value === "manual" ? (
              <small>Không liên kết với nhà cung cấp có sẵn</small>
            ) : null}
          </span>
        </span>

        <ChevronDown size={18} className={open ? "rotate" : ""} />
      </button>

      {open && (
        <div className="supplier-selector-menu">
          <div className="supplier-selector-search">
            <Search size={16} />
            <input
              autoFocus
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="Tìm tên, số điện thoại, tỉnh thành..."
            />
          </div>

          <div className="supplier-selector-options">
            {activeSuppliers.map((supplier) => (
              <button
                type="button"
                key={supplier.id}
                className="supplier-selector-option"
                onClick={() => chooseSupplier(supplier)}
              >
                <span className="supplier-selector-icon small">
                  <Building2 size={16} />
                </span>

                <span className="supplier-selector-option-text">
                  <strong>{supplier.name}</strong>
                  <small>
                    {supplier.phone || "Chưa có số điện thoại"}
                    {supplier.province || supplier.city
                      ? ` · ${supplier.province || supplier.city}`
                      : ""}
                  </small>
                  {supplier.address ? <em>{supplier.address}</em> : null}
                </span>
              </button>
            ))}

            {!activeSuppliers.length && (
              <div className="supplier-selector-empty">
                Không tìm thấy nhà cung cấp phù hợp.
              </div>
            )}

            {allowManual && (
              <button
                type="button"
                className="supplier-selector-manual"
                onClick={chooseManual}
              >
                + Nhập thông tin nhà cung cấp khác
              </button>
            )}
          </div>
        </div>
      )}

      <style jsx>{`
        .supplier-selector {
          position: relative;
          display: grid;
          gap: 8px;
        }

        .supplier-selector-label {
          color: #334155;
          font-size: 13px;
          font-weight: 600;
        }

        .supplier-selector-trigger {
          width: 100%;
          min-height: 50px;
          padding: 8px 12px;
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          background: #ffffff;
          color: #0f172a;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          text-align: left;
          cursor: pointer;
        }

        .supplier-selector-trigger.is-open,
        .supplier-selector-trigger:focus {
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12);
          outline: none;
        }

        .supplier-selector-trigger:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }

        .supplier-selector-main {
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .supplier-selector-icon {
          width: 34px;
          height: 34px;
          flex: 0 0 34px;
          border-radius: 9px;
          background: #eff6ff;
          color: #2563eb;
          display: grid;
          place-items: center;
        }

        .supplier-selector-icon.small {
          width: 32px;
          height: 32px;
          flex-basis: 32px;
        }

        .supplier-selector-text,
        .supplier-selector-option-text {
          min-width: 0;
          display: grid;
          gap: 3px;
        }

        .supplier-selector-text strong,
        .supplier-selector-option-text strong {
          overflow: hidden;
          color: #0f172a;
          font-size: 13px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .supplier-selector-text small,
        .supplier-selector-option-text small {
          color: #64748b;
          font-size: 11px;
        }

        .supplier-selector-option-text em {
          overflow: hidden;
          color: #94a3b8;
          font-size: 10px;
          font-style: normal;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .rotate {
          transform: rotate(180deg);
        }

        .supplier-selector-menu {
          position: absolute;
          top: calc(100% + 6px);
          right: 0;
          left: 0;
          z-index: 500;
          overflow: hidden;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          background: #ffffff;
          box-shadow: 0 20px 45px rgba(15, 23, 42, 0.17);
        }

        .supplier-selector-search {
          min-height: 42px;
          margin: 10px;
          padding: 0 11px;
          border: 1px solid #e2e8f0;
          border-radius: 9px;
          background: #f8fafc;
          color: #94a3b8;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .supplier-selector-search input {
          width: 100%;
          border: none;
          background: transparent;
          color: #0f172a;
          outline: none;
        }

        .supplier-selector-options {
          max-height: 300px;
          overflow-y: auto;
          padding: 0 8px 8px;
        }

        .supplier-selector-option {
          width: 100%;
          padding: 10px;
          border: none;
          border-radius: 9px;
          background: transparent;
          display: flex;
          align-items: flex-start;
          gap: 10px;
          text-align: left;
          cursor: pointer;
        }

        .supplier-selector-option:hover {
          background: #f1f5f9;
        }

        .supplier-selector-empty {
          padding: 24px 12px;
          color: #94a3b8;
          font-size: 12px;
          text-align: center;
        }

        .supplier-selector-manual {
          width: 100%;
          min-height: 40px;
          margin-top: 6px;
          border: 1px dashed #93c5fd;
          border-radius: 9px;
          background: #eff6ff;
          color: #1d4ed8;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
        }

        .supplier-selector-manual:hover {
          background: #dbeafe;
        }
      `}</style>
    </div>
  );
}
