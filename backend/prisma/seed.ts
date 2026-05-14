// @ts-nocheck
import {
  PrismaClient,
  BookingStatus,
  PaymentMethod,
  PaymentStatus,
  ReviewStatus,
  TourTheme,
  TourType,
} from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();

const destinationSeeds = [
  {
    name: "Phu Quoc",
    province: "Kien Giang",
    description:
      "Dao ngoc noi bat voi bien xanh, cat trang va nhieu khu nghi duong cao cap.",
    coverImage:
      "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80",
  },
  {
    name: "Nha Trang",
    province: "Khanh Hoa",
    description:
      "Thanh pho bien soi dong, phu hop nghi duong va vui choi tren vinh dep.",
    coverImage:
      "https://images.unsplash.com/photo-1500375592092-40eb2168fd21?auto=format&fit=crop&w=1200&q=80",
  },
  {
    name: "Da Lat",
    province: "Lam Dong",
    description:
      "Thanh pho ngan hoa, khi hau mat me, thich hop cho cap doi va gia dinh.",
    coverImage:
      "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80",
  },
  {
    name: "Da Nang",
    province: "Da Nang",
    description:
      "Thanh pho hien dai ket hop bien dep, am thuc phong phu va diem den gan Hoi An.",
    coverImage:
      "https://images.unsplash.com/photo-1493558103817-58b2924bce98?auto=format&fit=crop&w=1200&q=80",
  },
  {
    name: "Hoi An",
    province: "Quang Nam",
    description:
      "Pho co lang man voi den long, kien truc co kinh va van hoa dac sac.",
    coverImage:
      "https://images.unsplash.com/photo-1528127269322-539801943592?auto=format&fit=crop&w=1200&q=80",
  },
  {
    name: "Sa Pa",
    province: "Lao Cai",
    description:
      "Thi tran nui dep, ruong bac thang, san may va van hoa dan toc.",
    coverImage:
      "https://images.unsplash.com/photo-1527631746610-bca00a040d60?auto=format&fit=crop&w=1200&q=80",
  },
  {
    name: "Quy Nhon",
    province: "Binh Dinh",
    description: "Diem bien dang len voi eo gio, ky co va khong gian yen binh.",
    coverImage:
      "https://images.unsplash.com/photo-1473116763249-2faaef81ccda?auto=format&fit=crop&w=1200&q=80",
  },
  {
    name: "Ha Long",
    province: "Quang Ninh",
    description:
      "Ky quan thien nhien the gioi, du thuyen sang trong va nhieu hoat dong kham pha.",
    coverImage:
      "https://images.unsplash.com/photo-1482192505345-5655af888cc4?auto=format&fit=crop&w=1200&q=80",
  },
];

type TourSeed = {
  code: string;
  name: string;
  slug: string;
  destinationName: string;
  theme: TourTheme;
  type: TourType;
  durationDays: number;
  durationNights: number;
  hotelStars: number;
  adultPrice: number;
  childPrice: number;
  shortDescription: string;
  fullDescription: string;
  isTrending?: boolean;
  isBestDeal?: boolean;
  gallery: string[];
  itinerary: Array<{
    title: string;
    description: string;
    locationName: string;
  }>;
};

const tourSeeds: TourSeed[] = [
  {
    code: "PQ4N3D01",
    name: "Phu Quoc Premium Escape 4N3D",
    slug: "phu-quoc-premium-escape-4n3d",
    destinationName: "Phu Quoc",
    theme: "beach",
    type: "group",
    durationDays: 4,
    durationNights: 3,
    hotelStars: 4,
    adultPrice: 6590000,
    childPrice: 4790000,
    shortDescription:
      "Cap treo Hon Thom, Grand World, sunset town va nghi duong bien cao cap.",
    fullDescription:
      "Tour ket hop vui choi, check-in, nghi duong va am thuc dac san tai dao ngoc Phu Quoc.",
    isTrending: true,
    isBestDeal: true,
    gallery: [
      "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1473116763249-2faaef81ccda?auto=format&fit=crop&w=1200&q=80",
    ],
    itinerary: [
      {
        title: "Den Phu Quoc va nhan phong resort",
        description:
          "Don san bay, nhan phong, tu do tam bien va ngam hoang hon.",
        locationName: "Duong Dong",
      },
      {
        title: "Cap treo Hon Thom va Bai Sao",
        description:
          "Trai nghiem cap treo, cong vien nuoc va vui choi tren bai bien dep.",
        locationName: "Hon Thom",
      },
      {
        title: "Grand World va Safari",
        description:
          "Kham pha khu phuc hop giai tri va tham quan dong vat ban da.",
        locationName: "Bai Dai",
      },
      {
        title: "Mua sam dac san va ket thuc",
        description:
          "Thuong thuc am thuc dia phuong, mua qua va tra khach san bay.",
        locationName: "Cho Duong Dong",
      },
    ],
  },
  {
    code: "NT3N2D01",
    name: "Nha Trang Island Discovery 3N2D",
    slug: "nha-trang-island-discovery-3n2d",
    destinationName: "Nha Trang",
    theme: "beach",
    type: "group",
    durationDays: 3,
    durationNights: 2,
    hotelStars: 4,
    adultPrice: 4290000,
    childPrice: 3190000,
    shortDescription:
      "Du ngoan vinh, Thap Ba Ponagar, tam bun khoang nong va am thuc bien.",
    fullDescription:
      "Hanh trinh phu hop cho gia dinh va nhom ban muon tan huong bien dep va hoat dong nhe nhang.",
    isTrending: true,
    gallery: [
      "https://images.unsplash.com/photo-1500375592092-40eb2168fd21?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1527631746610-bca00a040d60?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1473116763249-2faaef81ccda?auto=format&fit=crop&w=1200&q=80",
    ],
    itinerary: [
      {
        title: "Nhan phong va dao pho bien",
        description: "Check-in khach san, nghi ngo va tu do kham pha pho dem.",
        locationName: "Tran Phu",
      },
      {
        title: "Tour 3 dao",
        description: "Lan ngam san ho, vui choi, an trua tren du thuyen.",
        locationName: "Vinh Nha Trang",
      },
      {
        title: "Thap Ba va khoang nong",
        description: "Tham quan, thu gian va len xe ve lai.",
        locationName: "Thap Ba Ponagar",
      },
    ],
  },
  {
    code: "DL3N2D01",
    name: "Da Lat Romantic Garden 3N2D",
    slug: "da-lat-romantic-garden-3n2d",
    destinationName: "Da Lat",
    theme: "family",
    type: "group",
    durationDays: 3,
    durationNights: 2,
    hotelStars: 4,
    adultPrice: 3890000,
    childPrice: 2790000,
    shortDescription:
      "Thung lung tinh yeu, Langbiang, vuon hoa va cafe san may.",
    fullDescription:
      "Tour thanh pho ngan hoa ket hop check-in, nghi duong va trai nghiem van hoa dia phuong.",
    isBestDeal: true,
    gallery: [
      "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1528127269322-539801943592?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1482192505345-5655af888cc4?auto=format&fit=crop&w=1200&q=80",
    ],
    itinerary: [
      {
        title: "Check-in trung tam Da Lat",
        description: "Nha tho Con Ga, ho Xuan Huong va cho dem.",
        locationName: "Trung tam thanh pho",
      },
      {
        title: "Langbiang va cafe san may",
        description:
          "Chinh phuc Langbiang va thuong thuc ca phe giua bien may.",
        locationName: "Langbiang",
      },
      {
        title: "Vuon hoa va tam biet Da Lat",
        description: "Tham quan vuon hoa, strawberry farm va ket thuc tour.",
        locationName: "Vuon hoa thanh pho",
      },
    ],
  },
  {
    code: "DNHA4N3D01",
    name: "Da Nang - Hoi An Signature 4N3D",
    slug: "da-nang-hoi-an-signature-4n3d",
    destinationName: "Da Nang",
    theme: "city",
    type: "group",
    durationDays: 4,
    durationNights: 3,
    hotelStars: 4,
    adultPrice: 5690000,
    childPrice: 4190000,
    shortDescription: "Ba Na Hills, Cau Vang, pho co Hoi An va bien My Khe.",
    fullDescription:
      "Tour noi bat cho du khach yeu thich check-in, am thuc va nhiep anh.",
    isTrending: true,
    gallery: [
      "https://images.unsplash.com/photo-1493558103817-58b2924bce98?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1528127269322-539801943592?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1500375592092-40eb2168fd21?auto=format&fit=crop&w=1200&q=80",
    ],
    itinerary: [
      {
        title: "Check-in Da Nang",
        description: "Ban dao Son Tra, Cau Rong va bien My Khe.",
        locationName: "Da Nang",
      },
      {
        title: "Ba Na Hills",
        description: "Cau Vang, khu vui choi va phong canh tren nui.",
        locationName: "Ba Na Hills",
      },
      {
        title: "Hoi An co kinh",
        description: "Pho co, den long, may do va am thuc dia phuong.",
        locationName: "Hoi An",
      },
      {
        title: "Mua sam va san bay",
        description: "Tu do va tra khach.",
        locationName: "Da Nang",
      },
    ],
  },
  {
    code: "HA3N2D01",
    name: "Hoi An Heritage Slow Travel 3N2D",
    slug: "hoi-an-heritage-slow-travel-3n2d",
    destinationName: "Hoi An",
    theme: "culture",
    type: "private",
    durationDays: 3,
    durationNights: 2,
    hotelStars: 4,
    adultPrice: 4990000,
    childPrice: 3690000,
    shortDescription:
      "Pho co Hoi An, lang gom, rung dua Bay Mau va hoat dong truyen thong.",
    fullDescription:
      "Lua chon phu hop cho du khach muon di chuyen nhe nhang va trai nghiem van hoa.",
    gallery: [
      "https://images.unsplash.com/photo-1528127269322-539801943592?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1493558103817-58b2924bce98?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80",
    ],
    itinerary: [
      {
        title: "Pho co len den",
        description: "Tham quan pho co, chua Cau va xem bieu dien dan gian.",
        locationName: "Hoi An Ancient Town",
      },
      {
        title: "Rung dua va lang nghe",
        description: "Trai nghiem thuyen thung, lang gom Thanh Ha.",
        locationName: "Bay Mau - Thanh Ha",
      },
      {
        title: "Workshop den long",
        description: "Tu tay lam den long va ket thuc.",
        locationName: "Hoi An",
      },
    ],
  },
  {
    code: "SP3N2D01",
    name: "Sa Pa Cloud Trek 3N2D",
    slug: "sa-pa-cloud-trek-3n2d",
    destinationName: "Sa Pa",
    theme: "mountain",
    type: "group",
    durationDays: 3,
    durationNights: 2,
    hotelStars: 4,
    adultPrice: 4590000,
    childPrice: 3390000,
    shortDescription:
      "Cat Cat, Fansipan, san may va ruong bac thang dep quanh nam.",
    fullDescription:
      "Tour nui phu hop cho du khach thich phong canh lanh va khong khi se lanh.",
    isTrending: true,
    gallery: [
      "https://images.unsplash.com/photo-1527631746610-bca00a040d60?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1482192505345-5655af888cc4?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80",
    ],
    itinerary: [
      {
        title: "Check-in thi tran Sa Pa",
        description: "Da nha tho da, cho tinh va khong gian ve dem.",
        locationName: "Sa Pa Town",
      },
      {
        title: "Fansipan - Cat Cat",
        description: "Di cap treo Fansipan va tham quan ban Cat Cat.",
        locationName: "Fansipan - Cat Cat",
      },
      {
        title: "San may va ve lai",
        description: "Cafe ngam may, mua sam dac san.",
        locationName: "O Quy Ho",
      },
    ],
  },
  {
    code: "QN3N2D01",
    name: "Quy Nhon Coastal Chill 3N2D",
    slug: "quy-nhon-coastal-chill-3n2d",
    destinationName: "Quy Nhon",
    theme: "beach",
    type: "group",
    durationDays: 3,
    durationNights: 2,
    hotelStars: 4,
    adultPrice: 3790000,
    childPrice: 2690000,
    shortDescription:
      "Ky Co, Eo Gio, Trung Luong Picnic va am thuc bien tuoi ngon.",
    fullDescription:
      "Chi phi hop ly, lich trinh vua suc, phu hop nhom tre va gia dinh.",
    isBestDeal: true,
    gallery: [
      "https://images.unsplash.com/photo-1473116763249-2faaef81ccda?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1500375592092-40eb2168fd21?auto=format&fit=crop&w=1200&q=80",
    ],
    itinerary: [
      {
        title: "Nhan phong va dao pho",
        description: "Bien Quy Nhon, surf cafe va hai san.",
        locationName: "Quy Nhon",
      },
      {
        title: "Ky Co - Eo Gio",
        description:
          "Tham quan va tam bien tai diem check-in dep nhat Binh Dinh.",
        locationName: "Ky Co - Eo Gio",
      },
      {
        title: "Trung Luong Picnic",
        description: "Thu gian truoc khi ket thuc hanh trinh.",
        locationName: "Trung Luong",
      },
    ],
  },
  {
    code: "HL3N2D01",
    name: "Ha Long Luxury Cruise 3N2D",
    slug: "ha-long-luxury-cruise-3n2d",
    destinationName: "Ha Long",
    theme: "luxury",
    type: "private",
    durationDays: 3,
    durationNights: 2,
    hotelStars: 5,
    adultPrice: 8290000,
    childPrice: 5990000,
    shortDescription:
      "Du thuyen qua dem, kayak, hang Sung Sot va tiec toi tren vinh.",
    fullDescription:
      "San pham cao cap danh cho cap doi hoac gia dinh can khong gian rieng tu.",
    isTrending: true,
    gallery: [
      "https://images.unsplash.com/photo-1482192505345-5655af888cc4?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1473116763249-2faaef81ccda?auto=format&fit=crop&w=1200&q=80",
    ],
    itinerary: [
      {
        title: "Len du thuyen",
        description: "Nhan phong, an trua va ngam vinh.",
        locationName: "Tuan Chau",
      },
      {
        title: "Kayak va hang dong",
        description: "Kham pha hang Sung Sot va cac khu vuc dep nhat.",
        locationName: "Ha Long Bay",
      },
      {
        title: "Brunch va ket thuc",
        description: "Tra phong va ve lai Ha Noi.",
        locationName: "Ha Long Bay",
      },
    ],
  },
  {
    code: "DN3N2D01",
    name: "Da Nang Family Beach Break 3N2D",
    slug: "da-nang-family-beach-break-3n2d",
    destinationName: "Da Nang",
    theme: "family",
    type: "group",
    durationDays: 3,
    durationNights: 2,
    hotelStars: 4,
    adultPrice: 3990000,
    childPrice: 2890000,
    shortDescription:
      "Bien My Khe, Asia Park va lich trinh vui ve cho gia dinh co tre nho.",
    fullDescription:
      "Tour de di, nhieu hoat dong nhe, phu hop nghi ngoi ngan ngay.",
    gallery: [
      "https://images.unsplash.com/photo-1493558103817-58b2924bce98?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1500375592092-40eb2168fd21?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80",
    ],
    itinerary: [
      {
        title: "Check-in resort",
        description: "Nghi ngo, tam bien va thu gian.",
        locationName: "My Khe",
      },
      {
        title: "Asia Park",
        description: "Vui choi cong vien va dao pho an toi.",
        locationName: "Asia Park",
      },
      {
        title: "Mua sam dac san",
        description: "Cho Han, cho Con va ket thuc.",
        locationName: "Da Nang",
      },
    ],
  },
  {
    code: "DL4N3D02",
    name: "Da Lat Wellness Retreat 4N3D",
    slug: "da-lat-wellness-retreat-4n3d",
    destinationName: "Da Lat",
    theme: "eco",
    type: "private",
    durationDays: 4,
    durationNights: 3,
    hotelStars: 4,
    adultPrice: 6190000,
    childPrice: 4590000,
    shortDescription:
      "Resort xanh, farmstay, tea workshop va lich trinh thu gian.",
    fullDescription:
      "Goi nghi duong theo phong cach cham soc than tam, phu hop cap doi.",
    gallery: [
      "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1482192505345-5655af888cc4?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1527631746610-bca00a040d60?auto=format&fit=crop&w=1200&q=80",
    ],
    itinerary: [
      {
        title: "Resort xanh",
        description:
          "Nghi ngo tai khu nghi duong, yoga nhe va an toi set menu.",
        locationName: "Tuyen Lam",
      },
      {
        title: "Tea workshop",
        description: "Hoc pha tra, cham soc ban than va tham vuon.",
        locationName: "Cau Dat",
      },
      {
        title: "Farm to table",
        description: "Thu hoach nong san va an trua huu co.",
        locationName: "Farmstay",
      },
      {
        title: "Tam biet Da Lat",
        description: "Cafe san may va mua qua ve.",
        locationName: "Da Lat",
      },
    ],
  },
  {
    code: "PQ3N2D02",
    name: "Phu Quoc Family Fun 3N2D",
    slug: "phu-quoc-family-fun-3n2d",
    destinationName: "Phu Quoc",
    theme: "family",
    type: "group",
    durationDays: 3,
    durationNights: 2,
    hotelStars: 4,
    adultPrice: 4890000,
    childPrice: 3590000,
    shortDescription:
      "VinWonders, Safari va bai bien dep cho gia dinh co tre nho.",
    fullDescription:
      "Goi tour vui choi - nghi duong toi uu chi phi va khong qua day lich.",
    isBestDeal: true,
    gallery: [
      "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1473116763249-2faaef81ccda?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80",
    ],
    itinerary: [
      {
        title: "Nhan phong va tam bien",
        description: "Thu gian ngay dau, ngam hoang hon.",
        locationName: "Phu Quoc",
      },
      {
        title: "Safari va VinWonders",
        description: "Ngay vui choi tron ven cho tre em va gia dinh.",
        locationName: "Bai Dai",
      },
      {
        title: "Cho Duong Dong",
        description: "Mua sam va ket thuc tour.",
        locationName: "Duong Dong",
      },
    ],
  },
  {
    code: "SP4N3D02",
    name: "Sa Pa Adventure Mix 4N3D",
    slug: "sa-pa-adventure-mix-4n3d",
    destinationName: "Sa Pa",
    theme: "adventure",
    type: "group",
    durationDays: 4,
    durationNights: 3,
    hotelStars: 4,
    adultPrice: 5490000,
    childPrice: 3990000,
    shortDescription: "Leo nui nhe, trekking ban lang va dem campfire am cung.",
    fullDescription:
      "San pham cho nhom ban tre thich kham pha nhung van giu muc do de di.",
    gallery: [
      "https://images.unsplash.com/photo-1527631746610-bca00a040d60?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1482192505345-5655af888cc4?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80",
    ],
    itinerary: [
      {
        title: "Len Sa Pa",
        description: "Nhan phong va tham quan nhe.",
        locationName: "Sa Pa Town",
      },
      {
        title: "Trekking Lao Chai - Ta Van",
        description: "Di bo qua ruong bac thang va ban lang.",
        locationName: "Lao Chai - Ta Van",
      },
      {
        title: "Campfire va giao luu",
        description: "Giao luu van hoa, thuong thuc mon nuong.",
        locationName: "Sa Pa",
      },
      {
        title: "May troi Tay Bac",
        description: "San may va ket thuc.",
        locationName: "O Quy Ho",
      },
    ],
  },
];

function buildAccommodationSeeds(tourSeed: TourSeed) {
  const baseAmenity =
    tourSeed.theme === "beach"
      ? "Ho boi, buffet sang, view bien, dua don san bay"
      : tourSeed.theme === "mountain"
        ? "May suoi, buffet sang, xe dua don trung tam"
        : "Buffet sang, trung tam, wifi toc do cao";

  return [
    {
      name: `${tourSeed.destinationName} ${tourSeed.hotelStars}★ Hotel`,
      accommodationType: "hotel",
      starRating: tourSeed.hotelStars,
      address: `Trung tam ${tourSeed.destinationName}`,
      description: `Luu tru chinh cho tour ${tourSeed.name}, phu hop nhom khach can vi tri thuan tien va dich vu on dinh.`,
      pricePerNight: Math.round(
        tourSeed.adultPrice / Math.max(tourSeed.durationNights || 1, 1) / 2,
      ),
      imageUrl: tourSeed.gallery[0],
      amenities: baseAmenity,
      status: "active",
    },
    {
      name: `${tourSeed.destinationName} Boutique Stay`,
      accommodationType:
        tourSeed.theme === "beach"
          ? "resort"
          : tourSeed.theme === "mountain"
            ? "homestay"
            : "hotel",
      starRating: Math.max(3, tourSeed.hotelStars - 1),
      address: `${tourSeed.destinationName} scenic area`,
      description: `Lua chon luu tru phu hop khach muon trai nghiem khong gian dia phuong ro net hon.`,
      pricePerNight: Math.round(
        tourSeed.childPrice / Math.max(tourSeed.durationNights || 1, 1) / 2,
      ),
      imageUrl: tourSeed.gallery[1] || tourSeed.gallery[0],
      amenities: `${baseAmenity}, cho gui hanh ly, ho tro check-in som`,
      status: "active",
    },
  ];
}

function buildTransportSeeds(tourSeed: TourSeed) {
  const longTrip = tourSeed.durationDays >= 4;
  return [
    {
      name: longTrip
        ? `Ve may bay den ${tourSeed.destinationName}`
        : `Xe khach den ${tourSeed.destinationName}`,
      transportType: longTrip
        ? "plane"
        : tourSeed.theme === "mountain"
          ? "train"
          : "coach",
      provider: longTrip ? "Vietnam Airlines / Vietjet" : "Travela Mobility",
      origin: "TP. Ho Chi Minh",
      destinationLabel: tourSeed.destinationName,
      durationHours: longTrip ? 2 : tourSeed.theme === "mountain" ? 7.5 : 6,
      price: Math.round(tourSeed.adultPrice * (longTrip ? 0.38 : 0.18)),
      description: `Phuong an di chuyen pho bien duoc goi y cho tour ${tourSeed.name}.`,
      imageUrl: tourSeed.gallery[0],
      status: "active",
    },
    {
      name: `Trung chuyen noi diem ${tourSeed.destinationName}`,
      transportType: tourSeed.theme === "beach" ? "boat" : "car",
      provider: "Travela Transfer",
      origin: tourSeed.destinationName,
      destinationLabel: "Theo lich trinh tour",
      durationHours: 1.5,
      price: Math.round(tourSeed.childPrice * 0.12),
      description: "Xe / tau trung chuyen cac diem tham quan trong hanh trinh.",
      imageUrl: tourSeed.gallery[2] || tourSeed.gallery[0],
      status: "active",
    },
  ];
}

const faqSeeds = [
  [
    "Huy tour nhu the nao?",
    "Ban co the gui yeu cau huy tour trong dashboard, he thong xu ly theo muc thoi gian va chinh sach cua tung san pham.",
    "booking",
  ],
  [
    "Website ho tro thanh toan gi?",
    "He thong demo ho tro MoMo, VNPay, card, bank transfer va cash.",
    "payment",
  ],
  [
    "Toi co the doi ngay khoi hanh khong?",
    "Co. Ban vao dashboard chon booking va lien he ho tro de doi ngay neu con cho.",
    "booking",
  ],
  [
    "Google login co can mat khau khong?",
    "Khong. Neu da cau hinh Google Client ID, ban dang nhap bang tai khoan Google truc tiep.",
    "auth",
  ],
  [
    "AI assistant dung de lam gi?",
    "AI assistant giup tu van tour, goi y diem den, huong dan booking va tra loi nhanh FAQ.",
    "ai",
  ],
  [
    "Toi co the thanh toan truoc mot phan khong?",
    "Ban co the dung bank transfer cho quy trinh xac nhan thu cong trong demo.",
    "payment",
  ],
  [
    "Tre em tinh gia the nao?",
    "Gia tre em tuy thuoc tung tour va duoc hien ro tren lich khoi hanh.",
    "pricing",
  ],
  [
    "Toi co the them yeu cau rieng?",
    "Ban them ghi chu trong phan booking, admin se kiem tra kha nang dap ung.",
    "support",
  ],
  [
    "Co hoa don booking khong?",
    "Trang dashboard va admin co the theo doi lich su booking va thanh toan de xuat hoa don demo.",
    "payment",
  ],
  [
    "Tour co bao gom xe dua don khong?",
    "Da so tour co dua don co ban; chi tiet duoc neu o mo ta day du cua tung tour.",
    "tour",
  ],
  [
    "Toi co can tao tai khoan moi book duoc khong?",
    "Khong bat buoc, nhung dang nhap se giup luu booking vao muc Tour cua toi.",
    "auth",
  ],
  [
    "Admin co the quan ly du lieu nao?",
    "Dashboard admin quan ly bookings, reviews, FAQs, contacts va studio tao tour 4 buoc.",
    "admin",
  ],
  [
    "Bot co the tu van tour theo ngan sach khong?",
    "Co. Ban chi can noi diem den, so ngay, muc ngan sach va thoi gian di du kien, bot se uu tien cac tour dang mo ban phu hop nhat.",
    "ai",
  ],
  [
    "Neu toi muon di thang sau thi bot co loc theo lich khoi hanh duoc khong?",
    "Co. Bot se dua tren cac dot khoi hanh dang mo va uu tien nhung tour co lich trong thang ban dang hoi.",
    "ai",
  ],
  [
    "Bot co nho noi dung vua chat khong?",
    "Bot se nho mot phan hoi thoai gan nhat de hieu ban dang noi tiep ve diem den, so ngay, ngan sach hay booking nao.",
    "ai",
  ],
];

function buildPolicySeeds(tourSeed: TourSeed) {
  return [
    {
      policyType: "cancel_policy",
      content: `Huy truoc 7 ngay so voi ngay khoi hanh cua tour ${tourSeed.name}: ho tro tiep nhan yeu cau som de admin kiem tra va xu ly theo tinh trang dich vu da dat.`,
      displayOrder: 1,
    },
    {
      policyType: "change_policy",
      content: `Co the doi ngay khoi hanh neu tour ${tourSeed.name} con cho o dot moi. Ban nen gui yeu cau som de duoc giu muc gia va tinh trang cho hop le.`,
      displayOrder: 2,
    },
    {
      policyType: "child_policy",
      content: `Gia tre em cua tour ${tourSeed.name} duoc hien rieng trong tung lich khoi hanh va co the thay doi theo tung dot mo ban.`,
      displayOrder: 3,
    },
  ];
}

function formatDateKey(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(base: Date, days: number) {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
}

async function resetDatabase() {
  await prisma.chatMessage.deleteMany();
  await prisma.chatConversation.deleteMany();
  await prisma.notificationRead.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.bookingStatusLog.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.bookingGuest.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.review.deleteMany();
  await prisma.contactEmailLog.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.faq.deleteMany();
  await prisma.tourTransport.deleteMany();
  await prisma.tourAccommodation.deleteMany();
  await prisma.tourDeparture.deleteMany();
  await prisma.tourPolicy.deleteMany();
  await prisma.tourItinerary.deleteMany();
  await prisma.tourMedia.deleteMany();
  await prisma.favoriteTour.deleteMany();
  await prisma.tour.deleteMany();
  await prisma.destination.deleteMany();
  await prisma.user.deleteMany();
}

async function main() {
  await resetDatabase();

  const passwordHash = await bcrypt.hash("123456", 10);
  const admin = await prisma.user.create({
    data: {
      fullName: "Nguyen Thanh Admin",
      email: "admin1@tourai.vn",
      phone: "0901000001",
      passwordHash,
      role: "admin",
      status: "active",
      authProvider: "local",
    },
  });

  await prisma.notification.createMany({
    data: [
      {
        title: "Ưu đãi tuần này",
        message:
          "Travela vừa cập nhật thêm các tour biển và tour gia đình mới.",
        content:
          "Travela vừa cập nhật thêm nhiều tour biển, tour nghỉ dưỡng và tour gia đình với lịch khởi hành mới. Bạn có thể vào mục Tour để xem chi tiết và đặt sớm.",
        targetRole: "user",
        isPublished: true,
        createdBy: admin.id,
      },
      {
        title: "Cập nhật xác nhận thanh toán",
        message:
          "Các đơn chuyển khoản sẽ được admin kiểm tra và xác nhận nhanh hơn trước.",
        content:
          "Hệ thống đã cập nhật luồng xác nhận thanh toán. Khi khách chuyển khoản xong, admin có thể duyệt thủ công và gửi phản hồi email xác nhận ngay trong hệ thống.",
        targetRole: "all",
        isPublished: true,
        createdBy: admin.id,
      },
      {
        title: "Thông báo nội bộ admin",
        message:
          "Kiểm tra lại tour sắp khởi hành trong tuần để tránh thiếu lịch trình hoặc ảnh.",
        content:
          "Đây là thông báo dành cho admin. Vui lòng rà lại các tour sắp khởi hành trong tuần, kiểm tra tình trạng publish, lịch trình ngày, ảnh cover và số chỗ còn trống.",
        targetRole: "admin",
        isPublished: true,
        createdBy: admin.id,
      },
    ],
  });

  const customers = [] as Awaited<ReturnType<typeof prisma.user.create>>[];
  for (let i = 1; i <= 80; i += 1) {
    const fullName = `Khach Hang ${String(i).padStart(3, "0")}`;
    const customer = await prisma.user.create({
      data: {
        fullName,
        email: `customer${String(i).padStart(3, "0")}@gmail.com`,
        phone: `091${String(1000000 + i).slice(-7)}`,
        passwordHash,
        role: "user",
        status: "active",
        authProvider: i % 6 === 0 ? "google" : "local",
        googleId: i % 6 === 0 ? `google-user-${i}` : null,
        avatarUrl:
          i % 6 === 0
            ? `https://api.dicebear.com/9.x/initials/svg?seed=User${i}`
            : null,
      },
    });
    customers.push(customer);
  }

  const destinationMap = new Map<
    string,
    Awaited<ReturnType<typeof prisma.destination.create>>
  >();
  for (const item of destinationSeeds) {
    const destination = await prisma.destination.create({
      data: {
        name: item.name,
        province: item.province,
        country: "Vietnam",
        description: item.description,
        coverImage: item.coverImage,
        status: "active",
      },
    });
    destinationMap.set(item.name, destination);
  }

  const createdTours = [] as Awaited<ReturnType<typeof prisma.tour.create>>[];
  const createdDepartures = [] as Awaited<
    ReturnType<typeof prisma.tourDeparture.create>
  >[];
  const today = new Date("2026-04-03T08:00:00");

  for (let idx = 0; idx < tourSeeds.length; idx += 1) {
    const tourSeed = tourSeeds[idx];
    const destination = destinationMap.get(tourSeed.destinationName)!;
    const tour = await prisma.tour.create({
      data: {
        code: tourSeed.code,
        name: tourSeed.name,
        slug: tourSeed.slug,
        destinationId: destination.id,
        tourType: tourSeed.type,
        tourTheme: tourSeed.theme,
        durationDays: tourSeed.durationDays,
        durationNights: tourSeed.durationNights,
        hotelStars: tourSeed.hotelStars,
        basePriceAdult: tourSeed.adultPrice,
        basePriceChild: tourSeed.childPrice,
        maxCapacityDefault: 80,
        shortDescription: tourSeed.shortDescription,
        fullDescription: tourSeed.fullDescription,
        status: "published",
        isTrending: tourSeed.isTrending ?? false,
        isBestDeal: tourSeed.isBestDeal ?? false,
      },
    });
    createdTours.push(tour);

    for (
      let mediaIndex = 0;
      mediaIndex < tourSeed.gallery.length;
      mediaIndex += 1
    ) {
      await prisma.tourMedia.create({
        data: {
          tourId: tour.id,
          mediaType: "image",
          fileUrl: tourSeed.gallery[mediaIndex],
          isCover: mediaIndex === 0,
          displayOrder: mediaIndex + 1,
        },
      });
    }

    for (
      let itineraryIndex = 0;
      itineraryIndex < tourSeed.itinerary.length;
      itineraryIndex += 1
    ) {
      const item = tourSeed.itinerary[itineraryIndex];
      await prisma.tourItinerary.create({
        data: {
          tourId: tour.id,
          dayNumber: itineraryIndex + 1,
          itemOrder: 1,
          title: item.title,
          description: item.description,
          locationName: item.locationName,
        },
      });
    }

    for (let d = 0; d < 6; d += 1) {
      const offset = idx * 2 + d * 9 + 5;
      const departureDate = formatDateKey(addDays(today, offset));
      const endDate = formatDateKey(
        addDays(departureDate, tourSeed.durationDays - 1),
      );
      const departure = await prisma.tourDeparture.create({
        data: {
          tourId: tour.id,
          departureDate,
          endDate,
          adultPrice: tourSeed.adultPrice + d * 100000,
          childPrice: tourSeed.childPrice + d * 80000,
          totalSlots: 80,
          bookedSlots: 0,
          heldSlots: 0,
          status: "open",
        },
      });
      createdDepartures.push(departure);
    }

    for (const policy of buildPolicySeeds(tourSeed)) {
      await prisma.tourPolicy.create({
        data: {
          tourId: tour.id,
          policyType: policy.policyType,
          content: policy.content,
          displayOrder: policy.displayOrder,
        },
      });
    }

    for (const accommodation of buildAccommodationSeeds(tourSeed)) {
      await prisma.tourAccommodation.create({
        data: {
          tourId: tour.id,
          ...accommodation,
        },
      });
    }

    for (const transport of buildTransportSeeds(tourSeed)) {
      await prisma.tourTransport.create({
        data: {
          tourId: tour.id,
          ...transport,
        },
      });
    }
  }

  for (let i = 0; i < faqSeeds.length; i += 1) {
    const [question, answer, topic] = faqSeeds[i];
    await prisma.faq.create({
      data: {
        question,
        answer,
        topic,
        status: "active",
        displayOrder: i + 1,
      },
    });
  }

  for (let i = 1; i <= 60; i += 1) {
    const customer = customers[i % customers.length];
    await prisma.contact.create({
      data: {
        userId: customer.id,
        fullName: customer.fullName,
        email: customer.email,
        phone: customer.phone,
        subject: [
          "Hoi gia",
          "Yeu cau doi ngay",
          "Tu van nhom gia dinh",
          "Khuyen mai",
          "Van de thanh toan",
        ][i % 5],
        message: `Noi dung lien he demo so ${i}. Khach can ho tro them ve lich khoi hanh va dich vu di kem.`,
        status: i % 5 === 0 ? "resolved" : i % 3 === 0 ? "processing" : "new",
        handledBy: admin.id,
      },
    });
  }

  const bookingStatuses: BookingStatus[] = [
    "confirmed",
    "confirmed",
    "confirmed",
    "completed",
    "pending_payment",
    "waiting_confirmation",
    "cancelled",
    "expired",
  ];
  const paymentMethodCycle: PaymentMethod[] = [
    "momo",
    "vnpay",
    "card",
    "bank_transfer",
    "cash",
  ];
  const paymentStatusMap: Record<BookingStatus, PaymentStatus> = {
    draft: "pending",
    pending_payment: "pending",
    waiting_confirmation: "waiting_confirmation",
    confirmed: "paid",
    cancelled: "failed",
    expired: "expired",
    completed: "paid",
  };

  const createdBookings = [] as Awaited<
    ReturnType<typeof prisma.booking.create>
  >[];

  for (let i = 1; i <= 300; i += 1) {
    const customer = customers[(i * 7) % customers.length];
    const departure = createdDepartures[(i * 5) % createdDepartures.length];
    const adultCount = i % 11 === 0 ? 4 : i % 5 === 0 ? 3 : i % 3 === 0 ? 2 : 1;
    const childCount = i % 9 === 0 ? 2 : i % 4 === 0 ? 1 : 0;
    const originalAmount =
      adultCount * Number(departure.adultPrice) +
      childCount * Number(departure.childPrice);
    const discountAmount =
      i % 12 === 0 ? 900000 : i % 7 === 0 ? 400000 : i % 4 === 0 ? 150000 : 0;
    const finalAmount = originalAmount - discountAmount;
    const bookingStatus = bookingStatuses[i % bookingStatuses.length];
    const paymentMethod =
      bookingStatus === "waiting_confirmation"
        ? "bank_transfer"
        : paymentMethodCycle[i % paymentMethodCycle.length];
    const createdAt = new Date(
      `2026-${String((i % 4) + 1).padStart(2, "0")}-${String((i % 26) + 1).padStart(2, "0")}T${String((i % 10) + 8).padStart(2, "0")}:15:00`,
    );
    const paidAt =
      bookingStatus === "confirmed" || bookingStatus === "completed"
        ? addDays(createdAt, 0)
        : null;
    const holdExpiresAt =
      bookingStatus === "pending_payment" ||
      bookingStatus === "waiting_confirmation"
        ? new Date(createdAt.getTime() + 3 * 60 * 60 * 1000)
        : null;

    const booking = await prisma.booking.create({
      data: {
        bookingCode: `BK2026${String(i).padStart(5, "0")}`,
        userId: customer.id,
        tourId: departure.tourId,
        departureId: departure.id,
        adultCount,
        childCount,
        originalAmount,
        discountAmount,
        finalAmount,
        bookingStatus,
        holdExpiresAt,
        contactName: customer.fullName,
        contactEmail: customer.email,
        contactPhone: customer.phone || `090${String(1000000 + i).slice(-7)}`,
        note: `Booking demo #${i} - seed du lieu lon`,
        createdAt,
        updatedAt: holdExpiresAt ?? paidAt ?? createdAt,
      },
    });
    createdBookings.push(booking);

    const guestTotal = adultCount + childCount;
    for (let g = 1; g <= guestTotal; g += 1) {
      await prisma.bookingGuest.create({
        data: {
          bookingId: booking.id,
          fullName: `${customer.fullName} Guest ${g}`,
          dateOfBirth: new Date(`${1980 + ((i + g) % 25)}-01-01T00:00:00`),
          gender: g % 2 === 0 ? "female" : "male",
          guestType: g <= adultCount ? "adult" : "child",
          idNumber: `ID${i}${g}`,
        },
      });
    }

    const payment = await prisma.payment.create({
      data: {
        bookingId: booking.id,
        paymentMethod,
        gatewayTransactionId:
          paymentStatusMap[bookingStatus] === "paid"
            ? `${paymentMethod.toUpperCase()}-${String(i).padStart(6, "0")}`
            : null,
        internalTransactionCode: `TXN2026${String(i).padStart(6, "0")}`,
        amount: finalAmount,
        paymentStatus: paymentStatusMap[bookingStatus],
        paidAt,
        createdAt,
        updatedAt: paidAt ?? createdAt,
      },
    });

    await prisma.bookingStatusLog.create({
      data: {
        bookingId: booking.id,
        actionType: "create",
        oldStatus: null,
        newStatus: "pending_payment",
        changedByUserId: customer.id,
        source: "user",
        reason: "Booking created from seed data",
        note: `Seed booking ${i}`,
        createdAt,
      },
    });

    if (bookingStatus === "confirmed" || bookingStatus === "completed") {
      await prisma.bookingStatusLog.create({
        data: {
          bookingId: booking.id,
          paymentId: payment.id,
          actionType:
            bookingStatus === "completed" ? "complete" : "payment_success",
          oldStatus: "pending_payment",
          newStatus: bookingStatus,
          changedByUserId: admin.id,
          source: "payment_gateway",
          reason:
            bookingStatus === "completed"
              ? "Tour completed"
              : "Payment success",
          createdAt: paidAt ?? createdAt,
        },
      });
    }

    if (bookingStatus === "waiting_confirmation") {
      await prisma.bookingStatusLog.create({
        data: {
          bookingId: booking.id,
          paymentId: payment.id,
          actionType: "payment_init",
          oldStatus: "pending_payment",
          newStatus: "waiting_confirmation",
          changedByUserId: customer.id,
          source: "user",
          reason: "Awaiting manual bank transfer confirmation",
          createdAt,
        },
      });
    }

    if (bookingStatus === "cancelled" || bookingStatus === "expired") {
      await prisma.bookingStatusLog.create({
        data: {
          bookingId: booking.id,
          paymentId: payment.id,
          actionType:
            bookingStatus === "cancelled" ? "payment_failed" : "expire",
          oldStatus: "pending_payment",
          newStatus: bookingStatus,
          changedByUserId: admin.id,
          source:
            bookingStatus === "cancelled" ? "payment_gateway" : "scheduler",
          reason:
            bookingStatus === "cancelled" ? "Payment failed" : "Hold expired",
          createdAt: holdExpiresAt ?? createdAt,
        },
      });
    }
  }

  for (const departure of createdDepartures) {
    const bookings = createdBookings.filter(
      (item) => item.departureId === departure.id,
    );
    let bookedSlots = 0;
    let heldSlots = 0;

    for (const booking of bookings) {
      const guests = booking.adultCount + booking.childCount;
      if (
        booking.bookingStatus === "confirmed" ||
        booking.bookingStatus === "completed"
      )
        bookedSlots += guests;
      if (
        booking.bookingStatus === "pending_payment" ||
        booking.bookingStatus === "waiting_confirmation"
      )
        heldSlots += guests;
    }

    await prisma.tourDeparture.update({
      where: { id: departure.id },
      data: {
        bookedSlots,
        heldSlots,
        status:
          bookedSlots + heldSlots >= Number(departure.totalSlots)
            ? "full"
            : "open",
      },
    });
  }

  const eligibleReviewBookings = createdBookings.filter(
    (booking) =>
      booking.bookingStatus === "confirmed" ||
      booking.bookingStatus === "completed",
  );

  for (let i = 1; i <= 180; i += 1) {
    const booking = eligibleReviewBookings[i % eligibleReviewBookings.length];
    const customer = customers[i % customers.length];
    const status: ReviewStatus =
      i % 11 === 0 ? "pending" : i % 17 === 0 ? "hidden" : "approved";
    await prisma.review.create({
      data: {
        tourId: booking.tourId,
        userId: customer.id,
        bookingId: booking.id,
        rating: (i % 5) + 1,
        comment: `Review demo ${i}: trai nghiem ${i % 5 >= 3 ? "rat tot" : "on dinh"} cho tour va dich vu huong dan.`,
        status,
        createdAt: addDays(new Date("2026-04-03T09:00:00"), -((i % 90) + 1)),
        updatedAt: addDays(new Date("2026-04-03T09:00:00"), -((i % 90) + 1)),
      },
    });
  }

  console.log("Seed completed successfully");
  console.log(`Users: ${1 + customers.length}`);
  console.log(`Destinations: ${destinationSeeds.length}`);
  console.log(`Tours: ${createdTours.length}`);
  console.log(`Departures: ${createdDepartures.length}`);
  console.log(`Bookings: ${createdBookings.length}`);
  console.log(`Reviews: 180`);
  console.log(`Contacts: 60`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
