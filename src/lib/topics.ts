// IELTS Speaking 话题库

export interface Topic {
  id: string;
  name: string;
  category: string;
  part1Questions: string[];
  part2CueCard: string;
  part3Questions: string[];
}

export const TOPICS: Topic[] = [
  {
    id: "hometown",
    name: "Hometown",
    category: "Place",
    part1Questions: [
      "Where is your hometown?",
      "What do you like about your hometown?",
      "How long have you lived there?",
      "Has your hometown changed much over the years?",
      "Would you recommend your hometown to tourists?",
    ],
    part2CueCard:
      "Describe your hometown. You should say: where it is, what it is known for, what you like and dislike about it, and explain why it is special to you.",
    part3Questions: [
      "How do cities in your country differ from each other?",
      "What are the advantages of living in a big city?",
      "Do you think people will continue to move to cities in the future?",
      "How has urbanization affected your country?",
    ],
  },
  {
    id: "work-study",
    name: "Work or Study",
    category: "Life",
    part1Questions: [
      "Do you work or study?",
      "What do you do for work?",
      "What are you studying?",
      "Do you enjoy your work/studies?",
      "What are your future career plans?",
    ],
    part2CueCard:
      "Describe your job or studies. You should say: what you do, why you chose this field, what you find most interesting about it, and explain how it affects your daily life.",
    part3Questions: [
      "How has the job market changed in recent years?",
      "Do you think education is important for success?",
      "What skills are most important in the modern workplace?",
      "How might technology change the nature of work in the future?",
    ],
  },
  {
    id: "hobbies",
    name: "Hobbies and Interests",
    category: "Leisure",
    part1Questions: [
      "What do you do in your free time?",
      "Do you have any hobbies?",
      "How long have you been interested in your hobbies?",
      "Do you prefer indoor or outdoor activities?",
      "Have your hobbies changed over the years?",
    ],
    part2CueCard:
      "Describe a hobby you enjoy. You should say: what it is, how often you do it, how you started it, and explain why you enjoy it.",
    part3Questions: [
      "Why do people need hobbies?",
      "Do you think hobbies should be productive?",
      "How have leisure activities changed with technology?",
      "Should schools encourage students to have hobbies?",
    ],
  },
  {
    id: "weather",
    name: "Weather",
    category: "Nature",
    part1Questions: [
      "What is the weather like in your country?",
      "What is your favorite season? Why?",
      "Does the weather affect your mood?",
      "Do you check the weather forecast regularly?",
      "Has the weather changed much in recent years?",
    ],
    part2CueCard:
      "Describe your favorite type of weather. You should say: what it is, when it occurs, what activities you do in this weather, and explain why you like it.",
    part3Questions: [
      "How does weather affect people's daily lives?",
      "Do you think climate change is a serious issue?",
      "How do different countries prepare for extreme weather?",
      "Should the government do more to address climate change?",
    ],
  },
  {
    id: "technology",
    name: "Technology",
    category: "Modern Life",
    part1Questions: [
      "Do you use technology often?",
      "What is your favorite piece of technology?",
      "How has technology changed your life?",
      "Do you think people spend too much time on their phones?",
      "What technology would you like to see in the future?",
    ],
    part2CueCard:
      "Describe a piece of technology you find useful. You should say: what it is, when you first used it, what you use it for, and explain why it is important to you.",
    part3Questions: [
      "How has technology changed the way people communicate?",
      "Do you think children should use technology from a young age?",
      "What are the negative effects of technology on society?",
      "Will artificial intelligence replace human workers?",
    ],
  },
  {
    id: "food",
    name: "Food",
    category: "Lifestyle",
    part1Questions: [
      "What is your favorite food?",
      "Do you prefer home-cooked meals or eating out?",
      "What kind of food is popular in your country?",
      "Do you enjoy cooking?",
      "Have your eating habits changed over the years?",
    ],
    part2CueCard:
      "Describe a traditional dish from your country. You should say: what it is, how it is made, when people usually eat it, and explain why it is significant.",
    part3Questions: [
      "How has globalization affected food culture?",
      "Do you think fast food is a serious health concern?",
      "Should governments regulate what people eat?",
      "How might food production change in the future?",
    ],
  },
];

export function getTopicById(id: string): Topic | undefined {
  return TOPICS.find((t) => t.id === id);
}

export function getRandomTopic(): Topic {
  return TOPICS[Math.floor(Math.random() * TOPICS.length)];
}

export function getCategories(): string[] {
  return [...new Set(TOPICS.map((t) => t.category))];
}
