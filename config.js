(function configureCrackTheQase() {
  const puzzles = ["01", "02", "03", "04", "05", "06"];
  const cheapPrizes = [
    { dieFace: 1, id: "book", label: "Book" },
    { dieFace: 2, id: "lock-pick-set", label: "Lock-pick set" },
    { dieFace: 3, id: "flashlight", label: "Flashlight" },
    { dieFace: 4, id: "m5stamp-fly", label: "M5Stamp Fly kit" },
    { dieFace: 5, id: "usb-powermeter", label: "USB powermeter" },
    { dieFace: 6, id: "t-echo-radio", label: "T-Echo radio" },
  ];

  for (const prize of cheapPrizes) {
    Object.freeze(prize);
  }

  window.CRACK_THE_QASE_CONFIG = Object.freeze({
    supabaseUrl: "https://hbifraiksxfemwgrvltx.supabase.co",
    supabasePublishableKey: "sb_publishable_A0xuq3ZTTmKE_YNoao_0Xw_k5jayN2B",
    eventSlug: "starwest-2026",
    eventName: "StarWest 2026",
    eventLocation: "Anaheim",
    boothLabel: "Booth 17",
    noticeVersion: "2026-09-05",
    puzzleSiteUrl: "https://crack-the-qase.fly.dev",
    puzzles: Object.freeze(puzzles),
    cheapPrizes: Object.freeze(cheapPrizes),
  });
})();
