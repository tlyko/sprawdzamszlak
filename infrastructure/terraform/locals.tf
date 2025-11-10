locals {
  app_name = "sprawdzamszlak-app"
  sprawdzamszlak_table = {
    name         = "sprawdzamszlak-data"
    billing_mode = "PAY_PER_REQUEST"
    hash_key     = "id"
    attributes = [
      {
        name = "id"
        type = "S"
      }
    ]
  }

  sprawdzamszlak_routes_table = {
    name         = "sprawdzamszlak-routes"
    billing_mode = "PAY_PER_REQUEST"
    hash_key     = "id"
    attributes = [
      {
        name = "id"
        type = "S"
      }
    ]
  }

  peaks = {
    "giewont" = {
      nazwa     = "Giewont",
      trudnosc  = "Umiarkowany",
      latitude  = "49.251005",
      longitude = "19.934084",
      height    = "1895",
      description_html = "Charakterystyczny szczyt z krzyżem. Widok na Zakopane."
    },
    "rysy" = {
      nazwa     = "Rysy",
      trudnosc  = "Trudny",
      latitude  = "49.1794",
      longitude = "20.0883",
      height    = "2503",
      description_html = "Najwyższy szczyt Polski. Wymagający szlak z łańcuchami."
    },
    "koscielec" = {
      nazwa     = "Kościelec",
      trudnosc  = "Trudny (bez łańcuchów)",
      latitude  = "49.225179",
      longitude = "20.014583",
      height    = "2155",
      description_html = "Piramida skalna, popularny cel wspinaczkowy i turystyczny."
    },
    "gerlach" = {
      nazwa     = "Gerlach (Gerlachovský štít)",
      trudnosc  = "Tylko z przewodnikiem",
      trudnosc_wspinaczkowa = "I (Droga Martina)",
      latitude  = "49.164028",
      longitude = "20.134028",
      height    = "2655",
      description_html = "Najwyższy szczyt Tatr i całych Karpat. Należy do Wielkiej Korony Tatr."
    },
    "lomnica" = {
      nazwa     = "Łomnica (Lomnický štít)",
      trudnosc  = "Tylko z przewodnikiem (lub kolejką)",
      trudnosc_wspinaczkowa = "I (Droga Jordana)",
      latitude  = "49.195139",
      longitude = "20.213056",
      height    = "2633",
      description_html = "Drugi co do wysokości szczyt Tatr. Dostępny kolejką linową."
    },
    "lodowy_szczyt" = {
      nazwa     = "Lodowy Szczyt (Ľadový štít)",
      trudnosc  = "Tylko z przewodnikiem",
      trudnosc_wspinaczkowa = "I (Droga Kapałkowych)",
      latitude  = "49.198556",
      longitude = "20.18275",
      height    = "2627",
      description_html = "Trzeci co do wysokości szczyt Tatr, potężna piramida lodowa."
    },
    "durny_szczyt" = {
      nazwa     = "Durny Szczyt (Pyšný štít)",
      trudnosc  = "Tylko z przewodnikiem",
      trudnosc_wspinaczkowa = "I / II",
      latitude  = "49.197583",
      longitude = "20.208",
      height    = "2621",
      description_html = "Uważany za jeden z najtrudniejszych do zdobycia szczytów w WKT."
    },
    "wysoka" = {
      nazwa     = "Wysoka (Vysoká)",
      trudnosc  = "Tylko z przewodnikiem",
      trudnosc_wspinaczkowa = "I / II",
      latitude  = "49.173174",
      longitude = "20.093512",
      height    = "2547",
      description_html = "Szósty co do wysokości szczyt Słowacji, znany z pięknych widoków."
    },
    "kiezmarski_szczyt" = {
      nazwa     = "Kieżmarski Szczyt (Kežmarský štít)",
      trudnosc  = "Tylko z przewodnikiem",
      trudnosc_wspinaczkowa = "0+",
      latitude  = "49.19925",
      longitude = "20.219472",
      height    = "2558",
      description_html = "Znany z potężnej południowej ściany."
    },
    "konczysta" = {
      nazwa     = "Kończysta (Končistá)",
      trudnosc  = "Tylko z przewodnikiem",
      trudnosc_wspinaczkowa = "I (na bloku szczytowym - 'Kowadło')",
      latitude  = "49.157306",
      longitude = "20.114083",
      height    = "2538",
      description_html = "Charakterystyczny wierzchołek z 'Kowadłem'."
    },
    "baranie_rogi" = {
      nazwa     = "Baranie Rogi (Baranie rohy)",
      trudnosc  = "Tylko z przewodnikiem",
      trudnosc_wspinaczkowa = "0+",
      latitude  = "49.201639",
      longitude = "20.197139",
      height    = "2530",
      description_html = "Ósmy szczyt WKT, popularny cel pozaszlakowy."
    },
    "krywan" = {
      nazwa     = "Krywań (Kriváň)",
      trudnosc  = "Trudny (szlakowany)",
      latitude  = "49.162833",
      longitude = "20.000056",
      height    = "2495",
      description_html = "Narodowa góra Słowaków. Prowadzi na nią szlak turystyczny."
    },
    "starolesny_szczyt" = {
      nazwa     = "Staroleśny Szczyt (Bradavica)",
      trudnosc  = "Tylko z przewodnikiem",
      trudnosc_wspinaczkowa = "I / II",
      latitude  = "49.171472",
      longitude = "20.155361",
      height    = "2476",
      description_html = "Strzelisty, czterowierzchołkowy szczyt."
    },
    "ganek" = {
      nazwa     = "Ganek (Gánok)",
      trudnosc  = "Tylko z przewodnikiem",
      trudnosc_wspinaczkowa = "II / III (słynna Galeria Gankowa)",
      latitude  = "49.174333",
      longitude = "20.103861",
      height    = "2462",
      description_html = "Trójwierzchołkowy szczyt w głównej grani Tatr."
    },
    "slawkowski_szczyt" = {
      nazwa     = "Sławkowski Szczyt (Slavkovský štít)",
      trudnosc  = "Trudny (szlakowany)",
      latitude  = "49.166065",
      longitude = "20.184761",
      height    = "2452",
      description_html = "Jeden z najłatwiej dostępnych szczytów WKT, prowadzi na niego szlak."
    },
    "posrednia_gran" = {
      nazwa     = "Pośrednia Grań (Prostredný hrot)",
      trudnosc  = "Tylko z przewodnikiem",
      trudnosc_wspinaczkowa = "I / II",
      latitude  = "49.184972",
      longitude = "20.194361",
      height    = "2439",
      description_html = "Najniższy szczyt WKT, ale bardzo wymagający."
    },
    "mieguszowiecki_wielki" = {
      nazwa     = "Mięguszowiecki Szczyt Wielki",
      trudnosc  = "Tylko z przewodnikiem / taternicko",
      trudnosc_wspinaczkowa = "I (Droga po Głazach)",
      latitude  = "49.187028",
      longitude = "20.059333",
      height    = "2438",
      description_html = "Drugi co do wysokości szczyt Polski."
    },
    "lodowa_kopa" = {
      nazwa     = "Lodowa Kopa (Malý Ľadový štít)",
      trudnosc  = "Tylko z przewodnikiem / taternicko",
      trudnosc_wspinaczkowa = "0+",
      latitude  = "49.196444",
      longitude = "20.182583",
      height    = "2602",
      description_html = "Niższy wierzchołek w masywie Lodowego Szczytu."
    }
    "szatan" = {
      nazwa     = "Szatan (Satan)",
      trudnosc  = "Tylko z przewodnikiem",
      trudnosc_wspinaczkowa = "I / II",
      latitude  = "49.163667",
      longitude = "20.052194",
      height    = "2421",
      description_html = "Najwyższy szczyt w Grani Baszt, dostępny pozaszlakowo.",
      wiki_url  = "https://pl.wikipedia.org/wiki/Szatan_(szczyt)"
    },
    "swistowy_szczyt" = {
      nazwa     = "Świstowy Szczyt (Svišťový štít)",
      trudnosc  = "Tylko z przewodnikiem",
      trudnosc_wspinaczkowa = "0+",
      latitude  = "49.182778",
      longitude = "20.144722",
      height    = "2418",
      description_html = "Położony między Doliną Staroleśną a Doliną Świstową.",
      wiki_url  = "https://pl.wikipedia.org/wiki/%C5%9Awistowy_Szczyt"
    },
    "mieguszowiecki_szczyt_czarny" = {
      nazwa     = "Mięguszowiecki Szczyt Czarny",
      trudnosc  = "Tylko z przewodnikiem / taternicko",
      trudnosc_wspinaczkowa = "I",
      latitude  = "49.182833",
      longitude = "20.067472",
      height    = "2410",
      description_html = "Wschodni z trzech Mięguszowieckich Szczytów.",
      wiki_url  = "https://pl.wikipedia.org/wiki/Mi%C4%99guszowiecki_Szczyt_Czarny"
    },
    "jaworowy_szczyt" = {
      nazwa     = "Jaworowy Szczyt (Javorový štít)",
      trudnosc  = "Tylko z przewodnikiem",
      trudnosc_wspinaczkowa = "II",
      latitude  = "49.187639",
      longitude = "20.16825",
      height    = "2417",
      description_html = "Potężny szczyt w głównej grani Tatr.",
      wiki_url  = "https://pl.wikipedia.org/wiki/Jaworowy_Szczyt"
    },
    "furkot" = {
      nazwa     = "Furkot (Furkotský štít)",
      trudnosc  = "Tylko z przewodnikiem",
      trudnosc_wspinaczkowa = "I",
      latitude  = "49.168667",
      longitude = "20.027389",
      height    = "2403",
      description_html = "Zwornikowy szczyt w bocznej grani Krywania.",
      wiki_url  = "https://pl.wikipedia.org/wiki/Furkot_(szczyt)"
    },
    "cubryna" = {
      nazwa     = "Cubryna (Čubrina)",
      trudnosc  = "Tylko z przewodnikiem / taternicko",
      trudnosc_wspinaczkowa = "I",
      latitude  = "49.187806",
      longitude = "20.053667",
      height    = "2376",
      description_html = "Szczyt w głównej grani Tatr, blisko Mięguszowieckich Szczytów.",
      wiki_url  = "https://pl.wikipedia.org/wiki/Cubryna"
    }
  }

routes = {
    "vysoka" = {
      name  = "Wysoka (trasa pozaszlakowa)"
      type  = "off-piste"
      filename = "vysoka.geojson"
    },
    "szatan" = {
      name  = "Szatan (trasa pozaszlakowa)"
      type  = "off-piste"
      filename = "szatan.geojson"
    },
    "swistowy_szczyt" = {
      name  = "Świstowy Szczyt (trasa pozaszlakowa)"
      type  = "off-piste"
      filename = "swistowy_szczyt.geojson"
    },
    "mieguszowiecki_szczyt_czarny" = {
      name  = "Mięguszowiecki Szczyt Czarny (trasa pozaszlakowa)"
      type  = "off-piste"
      filename = "mieguszowiecki_szczyt_czarny.geojson"
    },
    "krywan_gpx" = {
      name  = "Krywań (zapis GPX)"
      type  = "piste"
      filename = "krywan.geojson"
    },
    "konczysta_gpx" = {
      name  = "Kończysta (zapis GPX)"
      type  = "off-piste"
      filename = "konczysta.geojson"
    },
    "kiezmarski_szczyt_gpx" = {
      name  = "Kieżmarski Szczyt (zapis GPX)"
      type  = "off-piste"
      filename = "kiezmarski_szczyt.geojson"
    },
    "jaworowy_szczyt" = {
      name  = "Jaworowy Szczyt (trasa pozaszlakowa)"
      type  = "off-piste"
      filename = "jaworowy_szczyt.geojson"
    },
    "furkot" = {
      name  = "Furkot (trasa pozaszlakowa)"
      type  = "off-piste"
      filename = "furkot.geojson"
    },
    "cubryna" = {
      name  = "Cubryna (trasa pozaszlakowa)"
      type  = "off-piste"
      filename = "cubryna.geojson"
    },
    "baranie_rogi_gpx" = {
      name  = "Baranie Rogi (zapis GPX)"
      type  = "off-piste"
      filename = "baranie_rogi.geojson"
    },
    lodowa_kopa = {
      name  = "Lodowa Kopa (trasa pozaszlakowa)"
      type  = "off-piste"
      filename = "lodowa_kopa.geojson"
    }
  }
}