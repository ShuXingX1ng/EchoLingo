export type ImageStimulus = {
  url: string
  topic: string
  description: string
}

export const IMAGE_BANK: ImageStimulus[] = [
  {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8e/World_Population_History.svg/640px-World_Population_History.svg.png",
    topic: "World population growth over time",
    description:
      "A line graph showing world population growth from 10,000 BCE to the present. The curve is nearly flat until roughly 1800, then rises steeply, reaching over 7 billion in recent decades. The y-axis shows population in billions.",
  },
  {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/Global_average_temperature_-_NASA_GISS.svg/640px-Global_average_temperature_-_NASA_GISS.svg.png",
    topic: "Global average temperature anomaly (NASA GISS)",
    description:
      "A combined bar and line chart from NASA GISS showing the global average temperature anomaly relative to the 1951–1980 baseline, covering 1880 to the present. A clear warming trend is visible, accelerating after the 1970s.",
  },
  {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/80/World_map_-_low_resolution.svg/640px-World_map_-_low_resolution.svg.png",
    topic: "Political world map",
    description:
      "A colour-coded political world map displaying all countries and major oceans. Continents are distinguishable by colour groupings, with country borders clearly marked.",
  },
  {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/Good_Food_Display_-_NCI_Visuals_Online.jpg/640px-Good_Food_Display_-_NCI_Visuals_Online.jpg",
    topic: "Healthy food categories display",
    description:
      "A photograph showing a wide variety of healthy foods arranged in groups — fruits, vegetables, grains, dairy, and proteins — representing a balanced diet across different food categories.",
  },
  {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/GDP_PPP_Per_Capita_IMF_2008.svg/640px-GDP_PPP_Per_Capita_IMF_2008.svg.png",
    topic: "GDP per capita by country (world map)",
    description:
      "A choropleth world map showing GDP per capita (purchasing power parity) by country as of 2008, with darker colours representing higher income levels. Significant disparities are visible between developed and developing nations.",
  },
]

export function getRandomImage(): ImageStimulus {
  return IMAGE_BANK[Math.floor(Math.random() * IMAGE_BANK.length)]
}
