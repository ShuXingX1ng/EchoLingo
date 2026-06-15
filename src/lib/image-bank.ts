export type ImageStimulus = {
  url: string
  topic: string
  description: string
}

export const IMAGE_BANK: ImageStimulus[] = [
  {
    url: "/images/describe-image/renewable-energy.svg",
    topic: "Renewable energy share by country (2022)",
    description:
      "A vertical bar chart comparing the share of renewable energy in total electricity generation for seven countries in 2022. Norway and Iceland lead with nearly 100%, followed by Brazil at 84%. Germany sits at 44%, while China, the USA, and India all fall below 30%. Bars are colour-coded green for high share, orange for medium, and red for low.",
  },
  {
    url: "/images/describe-image/internet-users.svg",
    topic: "Global internet users 2000–2023",
    description:
      "A line chart with shaded area showing the growth of global internet users from 2000 to 2023. The number rises steadily from around 0.36 billion in 2000 to 5.16 billion in 2023, with the steepest growth occurring between 2010 and 2020. The y-axis shows user count in billions and the x-axis marks years at three-year intervals.",
  },
  {
    url: "/images/describe-image/transport-emissions.svg",
    topic: "CO₂ emissions by transport mode (2019)",
    description:
      "A donut pie chart breaking down CO₂ emissions from the transport sector by mode in 2019. Road vehicles dominate at 72%, followed by aviation at 11.6% and shipping at 10.5%. Rail accounts for only 1%, and other modes make up the remaining 4.9%. Each segment is labelled with its percentage and colour-coded in the legend.",
  },
  {
    url: "/images/describe-image/education-spending.svg",
    topic: "Government education spending vs GDP (2010 and 2020)",
    description:
      "A grouped bar chart comparing government expenditure on education as a percentage of GDP for six countries — Australia, Canada, Finland, Japan, the UK, and the USA — in 2010 (blue) and 2020 (orange). Finland consistently spends the most at around 6.5–6.8%, while Japan spends the least at roughly 3.4–3.8%. Most countries show a modest increase between the two years.",
  },
  {
    url: "/images/describe-image/water-access.svg",
    topic: "Access to safe drinking water by world region (2020)",
    description:
      "A horizontal bar chart displaying the percentage of the population with access to safely managed drinking water across six world regions in 2020. Europe and North America rank highest at 96%, followed by East Asia and Pacific at 78% and Latin America at 74%. South Asia and the Middle East both fall below 60%, while Sub-Saharan Africa has the lowest access at just 28%.",
  },
]

export function getRandomImage(excludeUrl?: string): ImageStimulus {
  const candidates = excludeUrl
    ? IMAGE_BANK.filter(img => img.url !== excludeUrl)
    : IMAGE_BANK
  const pool = candidates.length > 0 ? candidates : IMAGE_BANK
  return pool[Math.floor(Math.random() * pool.length)]
}
