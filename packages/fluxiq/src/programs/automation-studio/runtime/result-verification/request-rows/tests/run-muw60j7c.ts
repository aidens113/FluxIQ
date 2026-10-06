// The rows of live run `run-muw60j7c-bb7c9a62` (2026-10-05), as its judges were sent them:
// the build-test judge of step 0031 (the replayed reads 9 and 10, their readRows) and the
// result judge of step 0039 (the 30 stored rows, name and url, and the read s7). Copied from
// the run's request.json files; nothing else of either summary is needed here.
import type { AutomationStudioBuildTestStep, AutomationStudioResultReadAccount, AutomationStudioRunResultSummary } from "../../contracts.ts";

/** The request, as the Flow's instruction states it. */
export const RUN_MUW60J7C_REQUEST = "Find every pair of wireless earbuds in the store's search results that is Brightaisle Plus eligible, rated 4.0 or higher and priced under $50, going through every page of results. Leave out sponsored placements and accessories such as ear tips or charging cases, list each pair only once even if it turns up on two pages, and keep the order the search results show them in, with columns name, price, rating and url.";

/** The replayed list reads of the build test step 0031 judged. */
export const RUN_MUW60J7C_TEST_READS: AutomationStudioBuildTestStep[] = [
  {
    "step": 9,
    "action": "web.output.dom-extract_list",
    "outcome": "replayed",
    "observed": {
      "readRows": {
        "rows": [
          "Pulsebud Neo ANC Wireless Earbuds, Hybrid Active Noise Cancelling Bluetooth 5.4 Headphones, 50H Playtime, App EQ, Black",
          "Lumo Audio Drift Wireless Earbuds, Bluetooth 5.3 Headphones with 60H Playtime, Active Noise Cancelling, IPX7 Waterproof, Rose Gold",
          "Kinetra Run Wireless Earbuds, Bluetooth 5.3 Headphones with 60H Playtime, Built-in Mic, LED Power Display, Ivory",
          "Lumo Audio Drift Wireless Earbuds, Bluetooth 5.3 Headphones with 50H Playtime, Ear Hooks for Running, IPX7 Waterproof, Rose Gold",
          "Lumo Audio Drift Wireless Earbuds, Bluetooth 5.3 Headphones with 48H Playtime, Low Latency Gaming Mode, Wireless Charging Case, Rose Gold",
          "Lumo Audio Drift Wireless Earbuds, Bluetooth 5.3 Headphones with 60H Playtime, Active Noise Cancelling, IPX7 Waterproof, Rose Gold",
          "Soundcrest Air Pro 2 Wireless Earbuds, Bluetooth 5.3 Headphones with 60H Playtime, Wireless Charging Case, Active Noise Cancelling, Ivory",
          "Aurelle Pods Fit Wireless Earbuds, Bluetooth 5.3 Headphones with 50H Playtime, Wireless Charging Case, Ear Hooks for Running, Black",
          "Kinetra Run Wireless Earbuds, Bluetooth 5.3 Headphones with 30H Playtime, Deep Bass, Built-in Mic, Midnight Blue",
          "Kinetra Run Wireless Earbuds, Bluetooth 5.3 Headphones with 60H Playtime, IPX7 Waterproof, LED Power Display, Graphite",
          "SoundCrest AirPro Wireless Earbuds Bluetooth 5.3 In-Ear Headphones Stereo Bass 40H Playtime IPX7 Waterproof",
          "Novaq Q30 Pro Wireless Earbuds, Bluetooth 5.3 Headphones with 60H Playtime, IPX7 Waterproof, LED Power Display, Black",
          "Novaq Q20 Wireless Earbuds, Bluetooth 5.3 Headphones with 80H Playtime, Touch Control, Wireless Charging Case, Sage",
          "Replacement Ear Tips for Wireless Earbuds, Memory Foam Eartips, 3 Pairs (S/M/L), Black",
          "Tessaro Arc Wireless Earbuds, Bluetooth 5.3 Headphones with 48H Playtime, Active Noise Cancelling, Ear Hooks for Running, White",
          "Brightaisle Basics Sport Wireless Earbuds, Bluetooth 5.3 with Ear Hooks, 36H Playtime, IPX7 Sweatproof, Black",
          "Aurelle Pods Fit Wireless Earbuds, Bluetooth 5.3 Headphones with 30H Playtime, Touch Control, Deep Bass, Sage",
          "Pulsebud Mini Wireless Earbuds, Bluetooth 5.3 Headphones with 36H Playtime, Touch Control, Low Latency Gaming Mode, Rose Gold",
          "Zephyrline Z3 Wireless Earbuds, Bluetooth 5.3 Headphones with 24H Playtime, Deep Bass, Ear Hooks for Running, Sage",
          "Kinetra Run Hook Wireless Earbuds with Ear Hooks, Bluetooth 5.3 Sports Headphones, 60H Playtime, IPX7 Sweatproof, Black"
        ]
      }
    }
  },
  {
    "step": 10,
    "action": "web.output.dom-extract_list",
    "outcome": "replayed",
    "observed": {
      "readRows": {
        "rows": [
          "Lumo Audio Drift Wireless Earbuds, Bluetooth 5.3 Headphones with 50H Playtime, Ear Hooks for Running, IPX7 Waterproof, Rose Gold",
          "Brightaisle Basics Sport Wireless Earbuds, Bluetooth 5.3 with Ear Hooks, 36H Playtime, IPX7 Sweatproof, Black",
          "Zephyrline Z3 Wireless Earbuds, Bluetooth 5.3 Headphones with 24H Playtime, Deep Bass, Ear Hooks for Running, Sage",
          "Aurelle Echo Wireless Earbuds, Bluetooth 5.3 Headphones with 40H Playtime, Built-in Mic, Low Latency Gaming Mode, Ivory",
          "Aurelle Pods Fit Wireless Earbuds, Bluetooth 5.3 Headphones with 36H Playtime, Touch Control, Built-in Mic, Ivory",
          "Tessaro Arc Wireless Earbuds, Bluetooth 5.3 Headphones with 24H Playtime, IPX7 Waterproof, Touch Control, Sage",
          "Aurelle Pods Wireless Earbuds, Bluetooth 5.3 Headphones with 40H Playtime, Low Latency Gaming Mode, Touch Control, Black",
          "Trevio T5 Wireless Earbuds, Bluetooth 5.3 Headphones with 30H Playtime, Active Noise Cancelling, Built-in Mic, Ivory",
          "Aurelle Pods Wireless Earbuds, Bluetooth 5.3 Headphones with 50H Playtime, Deep Bass, Ear Hooks for Running, Black",
          "Soundcrest Air Pro 2 Wireless Earbuds, Bluetooth 5.3 Headphones with 36H Playtime, LED Power Display, Built-in Mic, Graphite"
        ],
        "leftOutOnlyByThis": [
          {
            "condition": "sponsored",
            "rows": [
              "Pulsebud Neo ANC Wireless Earbuds, Hybrid Active Noise Cancelling Bluetooth 5.4 Headphones, 50H Playtime, App EQ, Black — sponsored: Sponsored",
              "Kinetra Run Hook Wireless Earbuds with Ear Hooks, Bluetooth 5.3 Sports Headphones, 60H Playtime, IPX7 Sweatproof, Black — sponsored: Sponsored"
            ]
          },
          {
            "condition": "plus",
            "rows": [
              "Kinetra Run Wireless Earbuds, Bluetooth 5.3 Headphones with 60H Playtime, IPX7 Waterproof, LED Power Display, Graphite — plus: (no value)",
              "Aurelle Pods Fit Wireless Earbuds, Bluetooth 5.3 Headphones with 30H Playtime, Touch Control, Deep Bass, Sage — plus: (no value)",
              "Aurelle Echo Wireless Earbuds, Bluetooth 5.3 Headphones with 50H Playtime, Built-in Mic, Deep Bass, Ivory — plus: (no value)",
              "Tessaro Arc Wireless Earbuds, Bluetooth 5.3 Headphones with 48H Playtime, Built-in Mic, LED Power Display, Ivory — plus: (no value)",
              "Soundcrest Air Lite Wireless Earbuds, Bluetooth 5.3 Headphones with 80H Playtime, Ear Hooks for Running, Low Latency Gaming Mode, Ivory — plus: (no value)",
              "Tessaro Arc Wireless Earbuds, Bluetooth 5.3 Headphones with 24H Playtime, Low Latency Gaming Mode, Deep Bass, Ivory — plus: (no value)"
            ]
          },
          {
            "condition": "rating",
            "rows": [
              "Kinetra Run Wireless Earbuds, Bluetooth 5.3 Headphones with 30H Playtime, Deep Bass, Built-in Mic, Midnight Blue — rating: 3.8",
              "Novaq Q30 Pro Wireless Earbuds, Bluetooth 5.3 Headphones with 60H Playtime, IPX7 Waterproof, LED Power Display, Black — rating: 3.5",
              "Tessaro Arc Wireless Earbuds, Bluetooth 5.3 Headphones with 48H Playtime, Active Noise Cancelling, Ear Hooks for Running, White — rating: 3.9",
              "Oakhaven Sound Grove Wireless Earbuds, Bluetooth 5.3 Headphones with 48H Playtime, Ear Hooks for Running, Touch Control, Ivory — rating: 3.6",
              "Lumo Audio Drift Wireless Earbuds, Bluetooth 5.3 Headphones with 30H Playtime, IPX7 Waterproof, LED Power Display, Ivory — rating: 3.7",
              "Tessaro Arc Wireless Earbuds, Bluetooth 5.3 Headphones with 60H Playtime, Low Latency Gaming Mode, IPX7 Waterproof, Sage — rating: 3.6",
              "Pulsebud Mini Wireless Earbuds, Bluetooth 5.3 Headphones with 48H Playtime, Built-in Mic, LED Power Display, White — rating: 3.4",
              "Zephyrline Z3 Wireless Earbuds, Bluetooth 5.3 Headphones with 24H Playtime, Active Noise Cancelling, IPX7 Waterproof, Sage — rating: 3.7",
              "Lumo Audio Drift Wireless Earbuds, Bluetooth 5.3 Headphones with 24H Playtime, Touch Control, Ear Hooks for Running, Graphite — rating: 3.4",
              "Novaq Life Beam Wireless Earbuds, Bluetooth 5.3 Headphones with 60H Playtime, Low Latency Gaming Mode, IPX7 Waterproof, Ivory — rating: 3.6"
            ]
          },
          {
            "condition": "price",
            "rows": [
              "Lumo Audio Drift Wireless Earbuds, Bluetooth 5.3 Headphones with 60H Playtime, Active Noise Cancelling, IPX7 Waterproof, Rose Gold — price: $69.99",
              "Pulsebud Neo Wireless Earbuds, Bluetooth 5.3 Headphones with 48H Playtime, Deep Bass, Built-in Mic, Midnight Blue — price: $89.99",
              "Soundcrest Sport X Wireless Earbuds, Bluetooth 5.3 Headphones with 50H Playtime, Active Noise Cancelling, Ear Hooks for Running, White — price: $89.99"
            ]
          },
          {
            "condition": "name",
            "rows": [
              "Replacement Ear Tips for Wireless Earbuds, Memory Foam Eartips, 3 Pairs (S/M/L), Black",
              "Charging Case Replacement for Soundcrest Air Pro Wireless Earbuds, 600mAh Charger Case with Pairing Button, White",
              "Lumo Audio Drift Pro Wireless Earbuds, Bluetooth 5.3 Headphones with 60H Playtime, Wireless Charging Case, Touch Control, White",
              "Aurelle Pods Fit Wireless Earbuds, Bluetooth 5.3 Headphones with 36H Playtime, Touch Control, Built-in Mic, Ivory with Wireless Charging Case",
              "Trevio T5 Wireless Earbuds, Bluetooth 5.3 Headphones with 30H Playtime, Wireless Charging Case, Built-in Mic, Rose Gold"
            ]
          }
        ]
      }
    }
  }
];

/** The stored rows step 0039 judged, by name and url. */
export const RUN_MUW60J7C_STORED_ROWS = [
  {
    "name": "Pulsebud Neo ANC Wireless Earbuds, Hybrid Active Noise Cancelling Bluetooth 5.4 Headphones, 50H Playtime, App EQ, Black",
    "url": "/scenarios/everything-store/sspa/click?ie=UTF8&adId=sp-7Q2K91&url=%2Fscenarios%2Feverything-store%2FPulsebud-Neo-ANC-Wireless-Earbuds-Hybrid-Active-Noise%2Fdp%2FB0DPN4ANC7"
  },
  {
    "name": "Lumo Audio Drift Wireless Earbuds, Bluetooth 5.3 Headphones with 60H Playtime, Active Noise Cancelling, IPX7 Waterproof, Rose Gold",
    "url": "/scenarios/everything-store/sspa/click?ie=UTF8&adId=sp-3M8XT4&url=%2Fscenarios%2Feverything-store%2FLumo-Audio-Drift-Wireless-Earbuds-Bluetooth-5-3%2Fdp%2FB0CKQQT8ZC"
  },
  {
    "name": "Kinetra Run Wireless Earbuds, Bluetooth 5.3 Headphones with 60H Playtime, Built-in Mic, LED Power Display, Ivory",
    "url": "/scenarios/everything-store/Kinetra-Run-Wireless-Earbuds-Bluetooth-5-3-Headphones/dp/B0Z2SKHE0B"
  },
  {
    "name": "Lumo Audio Drift Wireless Earbuds, Bluetooth 5.3 Headphones with 50H Playtime, Ear Hooks for Running, IPX7 Waterproof, Rose Gold",
    "url": "/scenarios/everything-store/Lumo-Audio-Drift-Wireless-Earbuds-Bluetooth-5-3/dp/B0PXHP88KT"
  },
  {
    "name": "Lumo Audio Drift Wireless Earbuds, Bluetooth 5.3 Headphones with 48H Playtime, Low Latency Gaming Mode, Wireless Charging Case, Rose Gold",
    "url": "/scenarios/everything-store/Lumo-Audio-Drift-Wireless-Earbuds-Bluetooth-5-3/dp/B0P1XP6F3T"
  },
  {
    "name": "Lumo Audio Drift Wireless Earbuds, Bluetooth 5.3 Headphones with 60H Playtime, Active Noise Cancelling, IPX7 Waterproof, Rose Gold",
    "url": "/scenarios/everything-store/Lumo-Audio-Drift-Wireless-Earbuds-Bluetooth-5-3/dp/B0CKQQT8ZC"
  },
  {
    "name": "Soundcrest Air Pro 2 Wireless Earbuds, Bluetooth 5.3 Headphones with 60H Playtime, Wireless Charging Case, Active Noise Cancelling, Ivory",
    "url": "/scenarios/everything-store/Soundcrest-Air-Pro-2-Wireless-Earbuds-Bluetooth-5/dp/B0202BFR7U"
  },
  {
    "name": "Aurelle Pods Fit Wireless Earbuds, Bluetooth 5.3 Headphones with 50H Playtime, Wireless Charging Case, Ear Hooks for Running, Black",
    "url": "/scenarios/everything-store/Aurelle-Pods-Fit-Wireless-Earbuds-Bluetooth-5-3/dp/B0Z98WET4T"
  },
  {
    "name": "Kinetra Run Wireless Earbuds, Bluetooth 5.3 Headphones with 30H Playtime, Deep Bass, Built-in Mic, Midnight Blue",
    "url": "/scenarios/everything-store/Kinetra-Run-Wireless-Earbuds-Bluetooth-5-3-Headphones/dp/B0A4B2WTNE"
  },
  {
    "name": "Kinetra Run Wireless Earbuds, Bluetooth 5.3 Headphones with 60H Playtime, IPX7 Waterproof, LED Power Display, Graphite",
    "url": "/scenarios/everything-store/Kinetra-Run-Wireless-Earbuds-Bluetooth-5-3-Headphones/dp/B0FLQUDT3X"
  },
  {
    "name": "SoundCrest AirPro Wireless Earbuds Bluetooth 5.3 In-Ear Headphones Stereo Bass 40H Playtime IPX7 Waterproof",
    "url": "/scenarios/everything-store/sspa/click?ie=UTF8&adId=sp-9F1LB6&url=%2Fscenarios%2Feverything-store%2FSoundCrest-AirPro-Wireless-Earbuds-Bluetooth-5-3-In%2Fdp%2FB0CSCAPR53"
  },
  {
    "name": "Novaq Q30 Pro Wireless Earbuds, Bluetooth 5.3 Headphones with 60H Playtime, IPX7 Waterproof, LED Power Display, Black",
    "url": "/scenarios/everything-store/Novaq-Q30-Pro-Wireless-Earbuds-Bluetooth-5-3/dp/B01Y7UUVKX"
  },
  {
    "name": "Novaq Q20 Wireless Earbuds, Bluetooth 5.3 Headphones with 80H Playtime, Touch Control, Wireless Charging Case, Sage",
    "url": "/scenarios/everything-store/Novaq-Q20-Wireless-Earbuds-Bluetooth-5-3-Headphones/dp/B0TFNLKRRR"
  },
  {
    "name": "Replacement Ear Tips for Wireless Earbuds, Memory Foam Eartips, 3 Pairs (S/M/L), Black",
    "url": "/scenarios/everything-store/Replacement-Ear-Tips-for-Wireless-Earbuds-Memory-Foam/dp/B0JKYDKPGR"
  },
  {
    "name": "Tessaro Arc Wireless Earbuds, Bluetooth 5.3 Headphones with 48H Playtime, Active Noise Cancelling, Ear Hooks for Running, White",
    "url": "/scenarios/everything-store/Tessaro-Arc-Wireless-Earbuds-Bluetooth-5-3-Headphones/dp/B0GESECGZ2"
  },
  {
    "name": "Brightaisle Basics Sport Wireless Earbuds, Bluetooth 5.3 with Ear Hooks, 36H Playtime, IPX7 Sweatproof, Black",
    "url": "/scenarios/everything-store/Brightaisle-Basics-Sport-Wireless-Earbuds-Bluetooth-5-3/dp/B0R257NR7U"
  },
  {
    "name": "Aurelle Pods Fit Wireless Earbuds, Bluetooth 5.3 Headphones with 30H Playtime, Touch Control, Deep Bass, Sage",
    "url": "/scenarios/everything-store/Aurelle-Pods-Fit-Wireless-Earbuds-Bluetooth-5-3/dp/B0PXG323U8"
  },
  {
    "name": "Pulsebud Mini Wireless Earbuds, Bluetooth 5.3 Headphones with 36H Playtime, Touch Control, Low Latency Gaming Mode, Rose Gold",
    "url": "/scenarios/everything-store/Pulsebud-Mini-Wireless-Earbuds-Bluetooth-5-3-Headphones/dp/B0HRN6R1SL"
  },
  {
    "name": "Zephyrline Z3 Wireless Earbuds, Bluetooth 5.3 Headphones with 24H Playtime, Deep Bass, Ear Hooks for Running, Sage",
    "url": "/scenarios/everything-store/Zephyrline-Z3-Wireless-Earbuds-Bluetooth-5-3-Headphones/dp/B0P8ZF57AC"
  },
  {
    "name": "Kinetra Run Hook Wireless Earbuds with Ear Hooks, Bluetooth 5.3 Sports Headphones, 60H Playtime, IPX7 Sweatproof, Black",
    "url": "/scenarios/everything-store/sspa/click?ie=UTF8&adId=sp-4H6RZ2&url=%2Fscenarios%2Feverything-store%2FKinetra-Run-Hook-Wireless-Earbuds-with-Ear-Hooks%2Fdp%2FB0KRUNHK42"
  },
  {
    "name": "Lumo Audio Drift Wireless Earbuds, Bluetooth 5.3 Headphones with 50H Playtime, Ear Hooks for Running, IPX7 Waterproof, Rose Gold",
    "url": "/scenarios/everything-store/Lumo-Audio-Drift-Wireless-Earbuds-Bluetooth-5-3/dp/B0PXHP88KT"
  },
  {
    "name": "Brightaisle Basics Sport Wireless Earbuds, Bluetooth 5.3 with Ear Hooks, 36H Playtime, IPX7 Sweatproof, Black",
    "url": "/scenarios/everything-store/Brightaisle-Basics-Sport-Wireless-Earbuds-Bluetooth-5-3/dp/B0R257NR7U"
  },
  {
    "name": "Zephyrline Z3 Wireless Earbuds, Bluetooth 5.3 Headphones with 24H Playtime, Deep Bass, Ear Hooks for Running, Sage",
    "url": "/scenarios/everything-store/Zephyrline-Z3-Wireless-Earbuds-Bluetooth-5-3-Headphones/dp/B0P8ZF57AC"
  },
  {
    "name": "Aurelle Echo Wireless Earbuds, Bluetooth 5.3 Headphones with 40H Playtime, Built-in Mic, Low Latency Gaming Mode, Ivory",
    "url": "/scenarios/everything-store/Aurelle-Echo-Wireless-Earbuds-Bluetooth-5-3-Headphones/dp/B0J5MCMBAY"
  },
  {
    "name": "Aurelle Pods Fit Wireless Earbuds, Bluetooth 5.3 Headphones with 36H Playtime, Touch Control, Built-in Mic, Ivory",
    "url": "/scenarios/everything-store/Aurelle-Pods-Fit-Wireless-Earbuds-Bluetooth-5-3/dp/B0VNKJTVCD"
  },
  {
    "name": "Tessaro Arc Wireless Earbuds, Bluetooth 5.3 Headphones with 24H Playtime, IPX7 Waterproof, Touch Control, Sage",
    "url": "/scenarios/everything-store/Tessaro-Arc-Wireless-Earbuds-Bluetooth-5-3-Headphones/dp/B07Z1RZGJG"
  },
  {
    "name": "Aurelle Pods Wireless Earbuds, Bluetooth 5.3 Headphones with 40H Playtime, Low Latency Gaming Mode, Touch Control, Black",
    "url": "/scenarios/everything-store/Aurelle-Pods-Wireless-Earbuds-Bluetooth-5-3-Headphones/dp/B00BJX53AC"
  },
  {
    "name": "Trevio T5 Wireless Earbuds, Bluetooth 5.3 Headphones with 30H Playtime, Active Noise Cancelling, Built-in Mic, Ivory",
    "url": "/scenarios/everything-store/Trevio-T5-Wireless-Earbuds-Bluetooth-5-3-Headphones/dp/B0G68DZTDB"
  },
  {
    "name": "Aurelle Pods Wireless Earbuds, Bluetooth 5.3 Headphones with 50H Playtime, Deep Bass, Ear Hooks for Running, Black",
    "url": "/scenarios/everything-store/Aurelle-Pods-Wireless-Earbuds-Bluetooth-5-3-Headphones/dp/B02UB6NJWC"
  },
  {
    "name": "Soundcrest Air Pro 2 Wireless Earbuds, Bluetooth 5.3 Headphones with 36H Playtime, LED Power Display, Built-in Mic, Graphite",
    "url": "/scenarios/everything-store/Soundcrest-Air-Pro-2-Wireless-Earbuds-Bluetooth-5/dp/B016CBKJ2R"
  }
];

/** The run's reads, as step 0039 was sent them (their paging sentence left out). */
export const RUN_MUW60J7C_READS: AutomationStudioResultReadAccount[] = [
  {
    "nodeId": "node.bootstrap.589d57d24ac663c7.main.s6",
    "definitionId": "web.output.dom-extract_list",
    "pagesRead": 1,
    "pageLimit": 1,
    "stop": "page_limit",
    "truncated": true,
    "itemsSeen": 20,
    "kept": 20,
    "paginates": true,
    "dedupes": false,
    "dropsEarlierPageRepeats": true,
    "earlierPageRepeats": 0
  },
  {
    "nodeId": "node.bootstrap.589d57d24ac663c7.main.s7",
    "definitionId": "web.output.dom-extract_list",
    "pagesRead": 5,
    "stop": "control_disabled",
    "truncated": false,
    "itemsSeen": 94,
    "kept": 10,
    "paginates": true,
    "dedupes": true,
    "dedupeBy": [
      "url"
    ],
    "dropsEarlierPageRepeats": true,
    "earlierPageRepeats": 2,
    "conditions": [
      {
        "condition": "sponsored is absent",
        "rejected": 20,
        "alone": 4,
        "leftOutOnlyByThis": [
          "Pulsebud Neo ANC Wireless Earbuds, Hybrid Active Noise Cancelling Bluetooth 5.4 Headphones, 50H Playtime, App EQ, Black",
          "Kinetra Run Hook Wireless Earbuds with Ear Hooks, Bluetooth 5.3 Sports Headphones, 60H Playtime, IPX7 Sweatproof, Black"
        ]
      },
      {
        "condition": "plus is present",
        "rejected": 37,
        "alone": 6,
        "leftOutOnlyByThis": [
          "Kinetra Run Wireless Earbuds, Bluetooth 5.3 Headphones with 60H Playtime, IPX7 Waterproof, LED Power Display, Graphite",
          "Aurelle Pods Fit Wireless Earbuds, Bluetooth 5.3 Headphones with 30H Playtime, Touch Control, Deep Bass, Sage",
          "Aurelle Echo Wireless Earbuds, Bluetooth 5.3 Headphones with 50H Playtime, Built-in Mic, Deep Bass, Ivory",
          "Tessaro Arc Wireless Earbuds, Bluetooth 5.3 Headphones with 48H Playtime, Built-in Mic, LED Power Display, Ivory",
          "Soundcrest Air Lite Wireless Earbuds, Bluetooth 5.3 Headphones with 80H Playtime, Ear Hooks for Running, Low Latency Gaming Mode, Ivory",
          "Tessaro Arc Wireless Earbuds, Bluetooth 5.3 Headphones with 24H Playtime, Low Latency Gaming Mode, Deep Bass, Ivory"
        ]
      },
      {
        "condition": "rating atLeast 4",
        "rejected": 34,
        "alone": 12,
        "leftOutOnlyByThis": [
          "Kinetra Run Wireless Earbuds, Bluetooth 5.3 Headphones with 30H Playtime, Deep Bass, Built-in Mic, Midnight Blue — rating: 3.8",
          "Novaq Q30 Pro Wireless Earbuds, Bluetooth 5.3 Headphones with 60H Playtime, IPX7 Waterproof, LED Power Display, Black — rating: 3.5",
          "Tessaro Arc Wireless Earbuds, Bluetooth 5.3 Headphones with 48H Playtime, Active Noise Cancelling, Ear Hooks for Running, White — rating: 3.9",
          "Oakhaven Sound Grove Wireless Earbuds, Bluetooth 5.3 Headphones with 48H Playtime, Ear Hooks for Running, Touch Control, Ivory — rating: 3.6",
          "Lumo Audio Drift Wireless Earbuds, Bluetooth 5.3 Headphones with 30H Playtime, IPX7 Waterproof, LED Power Display, Ivory — rating: 3.7",
          "Tessaro Arc Wireless Earbuds, Bluetooth 5.3 Headphones with 60H Playtime, Low Latency Gaming Mode, IPX7 Waterproof, Sage — rating: 3.6",
          "Pulsebud Mini Wireless Earbuds, Bluetooth 5.3 Headphones with 48H Playtime, Built-in Mic, LED Power Display, White — rating: 3.4",
          "Zephyrline Z3 Wireless Earbuds, Bluetooth 5.3 Headphones with 24H Playtime, Active Noise Cancelling, IPX7 Waterproof, Sage — rating: 3.7",
          "Lumo Audio Drift Wireless Earbuds, Bluetooth 5.3 Headphones with 24H Playtime, Touch Control, Ear Hooks for Running, Graphite — rating: 3.4",
          "Novaq Life Beam Wireless Earbuds, Bluetooth 5.3 Headphones with 60H Playtime, Low Latency Gaming Mode, IPX7 Waterproof, Ivory — rating: 3.6"
        ]
      },
      {
        "condition": "price lessThan 50",
        "rejected": 40,
        "alone": 3,
        "leftOutOnlyByThis": [
          "Lumo Audio Drift Wireless Earbuds, Bluetooth 5.3 Headphones with 60H Playtime, Active Noise Cancelling, IPX7 Waterproof, Rose Gold — price: $69.99",
          "Pulsebud Neo Wireless Earbuds, Bluetooth 5.3 Headphones with 48H Playtime, Deep Bass, Built-in Mic, Midnight Blue — price: $89.99",
          "Soundcrest Sport X Wireless Earbuds, Bluetooth 5.3 Headphones with 50H Playtime, Active Noise Cancelling, Ear Hooks for Running, White — price: $89.99"
        ]
      },
      {
        "condition": "name not contains [\"ear tips\", \"charging case\", \"eartips\"]",
        "rejected": 20,
        "alone": 5,
        "leftOutOnlyByThis": [
          "Replacement Ear Tips for Wireless Earbuds, Memory Foam Eartips, 3 Pairs (S/M/L), Black",
          "Charging Case Replacement for Soundcrest Air Pro Wireless Earbuds, 600mAh Charger Case with Pairing Button, White",
          "Lumo Audio Drift Pro Wireless Earbuds, Bluetooth 5.3 Headphones with 60H Playtime, Wireless Charging Case, Touch Control, White",
          "Aurelle Pods Fit Wireless Earbuds, Bluetooth 5.3 Headphones with 36H Playtime, Touch Control, Built-in Mic, Ivory with Wireless Charging Case",
          "Trevio T5 Wireless Earbuds, Bluetooth 5.3 Headphones with 30H Playtime, Wireless Charging Case, Built-in Mic, Rose Gold"
        ]
      }
    ]
  }
];

/** What step 0039 answered. */
export const RUN_MUW60J7C_RESULT_JUDGE = {
  "summary": "The Flow searched \"wireless earbuds\", read page 1 (s6, maxPages 1, kept 20 unfiltered rows) and then read all 5 pages with filters (s7, kept 10 rows), appending both into one 30-row record set. The request wants every Brightaisle Plus eligible earbud rated ≥4.0 under $50 across all pages, excluding sponsored placements and accessories, deduped, in search order. The result is wrong in several ways: it contains 20 unfiltered page-1 rows (including sponsored placements and non-Plus items), it contains duplicate rows (e.g. Lumo Audio Drift B0PXHP88KT and Brightaisle Basics Sport B0R257NR7U appear twice), and the filtered read's conditions are too strict. The 'plus is present' condition (aria-label) rejected 37 rows and alone excluded 6 rows that satisfy the request, including Kinetra Run B0FLQUDT3X ($49.99, 4.5), Aurelle Pods Fit B0PXG323U8 ($49.99, 4.8), Aurelle Echo B0J5MCMBAY ($47.99, 4.5) and Tessaro Arc B07Z1RZGJG ($29.99, 4.2) — all under $50, rated ≥4.0, and not sponsored. The 'name not contains [ear tips, charging case, eartips]' condition alone excluded genuine earbuds whose names merely mention a charging case (e.g. Lumo Audio Drift Pro, Aurelle Pods Fit with Wireless Charging Case, Trevio T5), which the request says are still the item. The 'sponsored is absent' condition also excluded non-sponsored rows (Pulsebud Neo B0DPN4ANC7, Kinetra Run Hook B0KRUNHK42) because the sponsored field was read from the wrong element. The rating and price conditions look correct. So the result both over-includes (sponsored, non-Plus, duplicates) and under-includes (Plus-eligible earbuds dropped by the plus and name conditions).",
  "diagnosis": {
    "expected": "Every Brightaisle Plus eligible wireless earbud rated ≥4.0 and priced under $50, across all result pages, excluding sponsored placements and accessories (ear tips, charging cases), each pair once, in search order, with name, price, rating, url.",
    "observed": "30 rows: 20 unfiltered page-1 rows from s6 (sponsored and non-Plus included) plus 10 filtered rows from s7, with duplicates (B0PXHP88KT, B0R257NR7U twice). s7's 'plus is present' condition alone dropped 6 valid rows (e.g. B0FLQUDT3X $49.99/4.5, B0PXG323U8 $49.99/4.8, B0J5MCMBAY $47.99/4.5, B07Z1RZGJG $29.99/4.2); the name-not-contains condition dropped genuine earbuds mentioning a charging case; 'sponsored is absent' dropped non-sponsored rows.",
    "changed": "Remove or fix node.bootstrap.589d57d24ac663c7.main.s6 (it appends 20 unfiltered page-1 rows; either delete it or give it the same where/dedupe as s7). In s7, fix the 'plus is present' condition so it matches the actual Brightaisle Plus badge (the aria-label read is wrong and drops valid Plus items), and change the name exclusion to only drop items that are themselves accessories (ear tips / charging case products), not earbuds whose names mention a charging case. Keep dedupe by url and maxPages 50.",
    "stillAchievable": "yes",
    "deterministicRecoveryPossible": "yes",
    "answersRequest": "no",
    "explorationNeeded": true,
    "patchNeeded": true
  }
};

/** What step 0031 answered. */
export const RUN_MUW60J7C_TEST_JUDGE = {
  "summary": "The Flow searches \"wireless earbuds\", reads the results with paging (maxPages 50) and filters on sponsored absent, Brightaisle Plus present, rating ≥ 4, price < 50, and name not containing ear tips/charging case/eartips, deduping by url. The build test replayed the filtered read: it kept 10 rows from 5 pages, stopped on control_disabled (Next disabled on page 5), 94 items seen. The unfiltered read (step 9) kept 20 rows from 1 page only (maxPages 1), so it is not the paging read; the filtered read is the one that pages. The endView shows page 5 of results with Next disabled, consistent with the read having gone through all pages. The conditions look correct against the request: sponsored rows excluded, non-Plus rows excluded, rating below 4 excluded, price ≥ 50 excluded, accessory names excluded. The kept rows are all wireless earbuds, Plus eligible, rated ≥ 4, under $50, deduped by url. The request asks for columns name, price, rating and url; the record schema has those four fields. The Flow appears to do what was asked.",
  "diagnosis": {
    "expected": "Every Brightaisle Plus eligible wireless earbud rated 4.0+ under $50 from all search result pages, excluding sponsored and accessories, deduped by url, in search order, with columns name, price, rating, url.",
    "observed": "Filtered read kept 10 rows from 5 pages, stopped on control_disabled (Next disabled), 94 items seen; conditions rejected sponsored 20, plus 37, rating 34, price 40, name 20. Kept rows are all earbuds, Plus, rating ≥ 4, price < 50, deduped by url. endView shows page 5 with Next disabled.",
    "changed": "",
    "stillAchievable": "yes",
    "deterministicRecoveryPossible": "yes",
    "answersRequest": "yes",
    "explorationNeeded": false,
    "patchNeeded": false
  }
};

/** The node of the run's filtered read, s7. */
export const RUN_MUW60J7C_FILTERED_READ = "node.bootstrap.589d57d24ac663c7.main.s7";

/** The three pairs of earbuds the name condition alone left out, each sold with a charging case. */
export const RUN_MUW60J7C_PAIRS_LEFT_OUT = [
  "Lumo Audio Drift Pro Wireless Earbuds, Bluetooth 5.3 Headphones with 60H Playtime, Wireless Charging Case, Touch Control, White",
  "Aurelle Pods Fit Wireless Earbuds, Bluetooth 5.3 Headphones with 36H Playtime, Touch Control, Built-in Mic, Ivory with Wireless Charging Case",
  "Trevio T5 Wireless Earbuds, Bluetooth 5.3 Headphones with 30H Playtime, Wireless Charging Case, Built-in Mic, Rose Gold"
];

/** The build test step 0031 judged: its replayed reads, and nothing stored. */
export function runMuw60j7cTestSummary(): AutomationStudioRunResultSummary {
  return {
    schemaVersion: "automation-studio.run-result-summary.v1",
    totalRecordCount: 0,
    totalRefusedCount: 0,
    totalRowsMissingRequired: 0,
    recordSetCount: 0,
    recordSets: [],
    flowShape: [],
    withheld: false,
    buildTest: { kind: "build_test", test: "ran", steps: structuredClone(RUN_MUW60J7C_TEST_READS) }
  };
}

/** The finished run step 0039 judged: its 30 stored rows and its reads. */
export function runMuw60j7cRunSummary(): AutomationStudioRunResultSummary {
  return {
    schemaVersion: "automation-studio.run-result-summary.v1",
    totalRecordCount: 30,
    totalRefusedCount: 0,
    totalRowsMissingRequired: 0,
    recordSetCount: 1,
    recordSets: [{
      datasetId: "web.output.dom-extract_list", recordCount: 30, refusedCount: 0, truncated: false, columns: ["name", "url"], columnsWithheld: false,
      rowsChecked: 30, rowsMissingRequired: 0, missingRequiredColumns: [], sampleRows: structuredClone(RUN_MUW60J7C_STORED_ROWS)
    }],
    reads: structuredClone(RUN_MUW60J7C_READS),
    flowShape: [],
    withheld: false
  };
}
