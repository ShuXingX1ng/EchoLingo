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
  // ========== Place 地点 ==========
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
    id: "accommodation",
    name: "Accommodation",
    category: "Place",
    part1Questions: [
      "Where do you live?",
      "What kind of accommodation do you live in?",
      "Do you like your current accommodation?",
      "What would you like to change about your home?",
      "Is there anything you would like to add to your home?",
    ],
    part2CueCard:
      "Describe your ideal home. You should say: where it would be, what it would look like, what rooms it would have, and explain why this would be your ideal home.",
    part3Questions: [
      "How has housing changed in your country in recent years?",
      "Do you think it's better to rent or buy a home?",
      "What are the differences between living in the city and the countryside?",
      "How do you think housing will change in the future?",
    ],
  },
  {
    id: "favorite-place",
    name: "Favorite Place",
    category: "Place",
    part1Questions: [
      "Do you have a favorite place to visit?",
      "How often do you go there?",
      "What do you do there?",
      "Who do you usually go there with?",
      "When did you first visit this place?",
    ],
    part2CueCard:
      "Describe a place you like to visit. You should say: where it is, how often you go there, what you do there, and explain why you enjoy visiting this place.",
    part3Questions: [
      "Why do people like to visit certain places?",
      "How has tourism changed in your country?",
      "What makes a place attractive to tourists?",
      "Should governments invest more in tourism?",
    ],
  },

  // ========== Life 生活 ==========
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
    id: "daily-routine",
    name: "Daily Routine",
    category: "Life",
    part1Questions: [
      "What is your daily routine?",
      "Do you have a regular routine?",
      "Has your routine changed compared to a few years ago?",
      "What is the busiest part of your day?",
      "Do you prefer mornings or evenings?",
    ],
    part2CueCard:
      "Describe your typical day. You should say: what time you wake up, what activities you do throughout the day, what your evening is like, and explain whether you enjoy your routine.",
    part3Questions: [
      "How do routines differ between young and old people?",
      "Do you think having a routine is important?",
      "How has technology affected people's daily routines?",
      "Should work schedules be more flexible?",
    ],
  },
  {
    id: "sleep",
    name: "Sleep",
    category: "Life",
    part1Questions: [
      "How many hours do you usually sleep?",
      "Do you think sleep is important?",
      "Do you take naps?",
      "Have your sleeping habits changed over the years?",
      "What helps you sleep better?",
    ],
    part2CueCard:
      "Describe a time when you had difficulty sleeping. You should say: when it was, why you couldn't sleep, how you felt the next day, and explain how you dealt with the situation.",
    part3Questions: [
      "Why do some people have trouble sleeping?",
      "How does sleep affect health?",
      "Do you think modern lifestyle affects sleep quality?",
      "Should companies consider employees' sleep needs?",
    ],
  },

  // ========== Leisure 休闲 ==========
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
    id: "sports",
    name: "Sports",
    category: "Leisure",
    part1Questions: [
      "Do you like sports?",
      "What is your favorite sport?",
      "Did you play any sports as a child?",
      "Do you prefer watching or playing sports?",
      "Is there a sport you would like to try?",
    ],
    part2CueCard:
      "Describe a sport you enjoy watching or playing. You should say: what it is, how often you do it, who you do it with, and explain why you enjoy it.",
    part3Questions: [
      "Why are some sports more popular than others?",
      "Should sports be compulsory in schools?",
      "How has professional sports changed over the years?",
      "Do you think e-sports should be considered real sports?",
    ],
  },
  {
    id: "music",
    name: "Music",
    category: "Leisure",
    part1Questions: [
      "Do you like music?",
      "What kind of music do you listen to?",
      "Do you play any musical instruments?",
      "Has your taste in music changed over the years?",
      "Do you prefer listening to music alone or with others?",
    ],
    part2CueCard:
      "Describe a song or piece of music you like. You should say: what it is, when you first heard it, what it is about, and explain why you like it.",
    part3Questions: [
      "How has music changed over the decades?",
      "Do you think music is an important part of culture?",
      "Should children learn to play musical instruments?",
      "How has technology affected the music industry?",
    ],
  },
  {
    id: "reading",
    name: "Reading",
    category: "Leisure",
    part1Questions: [
      "Do you like reading?",
      "What kind of books do you read?",
      "Do you prefer physical books or e-books?",
      "How often do you read?",
      "What was the last book you read?",
    ],
    part2CueCard:
      "Describe a book that influenced you. You should say: what book it is, when you read it, what it is about, and explain how it influenced you.",
    part3Questions: [
      "Why do some people prefer reading to watching movies?",
      "Has the way people read changed with technology?",
      "Should schools encourage students to read more?",
      "Do you think reading will become less popular in the future?",
    ],
  },
  {
    id: "movies",
    name: "Movies",
    category: "Leisure",
    part1Questions: [
      "Do you like watching movies?",
      "What kind of movies do you prefer?",
      "How often do you go to the cinema?",
      "Do you prefer watching movies at home or in the cinema?",
      "Who do you usually watch movies with?",
    ],
    part2CueCard:
      "Describe your favorite movie. You should say: what it is, when you first watched it, what it is about, and explain why it is your favorite.",
    part3Questions: [
      "How has the film industry changed over the years?",
      "Do you think streaming services are replacing cinemas?",
      "Should there be more regulation of movie content?",
      "How do movies influence society?",
    ],
  },
  {
    id: "travel",
    name: "Travel",
    category: "Leisure",
    part1Questions: [
      "Do you like traveling?",
      "Where was the last place you traveled to?",
      "Do you prefer traveling alone or with others?",
      "What kind of places do you like to visit?",
      "Do you prefer domestic or international travel?",
    ],
    part2CueCard:
      "Describe a memorable trip you took. You should say: where you went, when you went, who you went with, and explain why it was memorable.",
    part3Questions: [
      "How has tourism changed in your country?",
      "What are the benefits of traveling?",
      "Do you think mass tourism is harmful?",
      "How might travel change in the future?",
    ],
  },

  // ========== Nature 自然 ==========
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
    id: "animals",
    name: "Animals",
    category: "Nature",
    part1Questions: [
      "Do you like animals?",
      "Do you have any pets?",
      "What is your favorite animal?",
      "Are there any animals that are common in your country?",
      "Did you have any pets as a child?",
    ],
    part2CueCard:
      "Describe an interesting animal. You should say: what it is, where it lives, what makes it interesting, and explain how you learned about it.",
    part3Questions: [
      "Why do some people keep exotic pets?",
      "Should animals be kept in zoos?",
      "How has the relationship between humans and animals changed?",
      "What can be done to protect endangered species?",
    ],
  },
  {
    id: "nature",
    name: "Nature",
    category: "Nature",
    part1Questions: [
      "Do you like spending time in nature?",
      "How often do you spend time outdoors?",
      "What is your favorite natural place?",
      "Are there many parks near your home?",
      "Do you think it's important to protect nature?",
    ],
    part2CueCard:
      "Describe a beautiful natural place you have visited. You should say: where it is, when you visited it, what you saw there, and explain why you found it beautiful.",
    part3Questions: [
      "Why is it important to protect natural environments?",
      "How has urbanization affected nature?",
      "What can individuals do to help the environment?",
      "Should children spend more time in nature?",
    ],
  },
  {
    id: "flowers",
    name: "Flowers",
    category: "Nature",
    part1Questions: [
      "Do you like flowers?",
      "What is your favorite flower?",
      "Do you give flowers as gifts?",
      "Are flowers important in your culture?",
      "Do you grow any plants at home?",
    ],
    part2CueCard:
      "Describe a flower that is important in your country. You should say: what it is, where it grows, when it blooms, and explain why it is important.",
    part3Questions: [
      "Why are flowers important in different cultures?",
      "Should cities have more green spaces?",
      "How has flower cultivation changed over the years?",
      "Do you think people should grow their own flowers?",
    ],
  },

  // ========== Modern Life 现代生活 ==========
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
    id: "social-media",
    name: "Social Media",
    category: "Modern Life",
    part1Questions: [
      "Do you use social media?",
      "Which social media platforms do you use?",
      "How much time do you spend on social media?",
      "Do you think social media is beneficial?",
      "Has your use of social media changed over the years?",
    ],
    part2CueCard:
      "Describe a social media platform you often use. You should say: what it is, how you use it, what you like about it, and explain how it has affected your life.",
    part3Questions: [
      "How has social media affected relationships?",
      "Should social media companies be regulated?",
      "Do you think social media is addictive?",
      "How might social media change in the future?",
    ],
  },
  {
    id: "shopping",
    name: "Shopping",
    category: "Modern Life",
    part1Questions: [
      "Do you enjoy shopping?",
      "How often do you go shopping?",
      "Do you prefer shopping online or in stores?",
      "What was the last thing you bought?",
      "Do you like buying things on sale?",
    ],
    part2CueCard:
      "Describe a memorable shopping experience. You should say: where you went, what you bought, who you were with, and explain why it was memorable.",
    part3Questions: [
      "How has online shopping changed retail?",
      "Do you think people buy too many things?",
      "Should there be more regulation of advertising?",
      "How might shopping change in the future?",
    ],
  },
  {
    id: "transport",
    name: "Transport",
    category: "Modern Life",
    part1Questions: [
      "How do you usually travel?",
      "What is your favorite mode of transport?",
      "Is public transport good in your city?",
      "Do you prefer driving or being a passenger?",
      "Have you ever been on a long journey?",
    ],
    part2CueCard:
      "Describe a memorable journey you have taken. You should say: where you went, how you traveled, who you were with, and explain why it was memorable.",
    part3Questions: [
      "How has transportation changed over the years?",
      "What are the benefits of public transport?",
      "Should governments invest more in transport infrastructure?",
      "How might transportation change in the future?",
    ],
  },
  {
    id: "internet",
    name: "Internet",
    category: "Modern Life",
    part1Questions: [
      "How often do you use the internet?",
      "What do you use the internet for?",
      "Do you think the internet is important?",
      "Has the internet changed your life?",
      "Can you imagine life without the internet?",
    ],
    part2CueCard:
      "Describe how the internet has changed your life. You should say: when you first started using it, how you use it, what you use it for, and explain how it has affected your daily life.",
    part3Questions: [
      "How has the internet changed the way people learn?",
      "Do you think the internet has more advantages or disadvantages?",
      "Should the internet be censored?",
      "How might the internet change in the future?",
    ],
  },

  // ========== Lifestyle 生活方式 ==========
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
  {
    id: "health",
    name: "Health",
    category: "Lifestyle",
    part1Questions: [
      "Are you a healthy person?",
      "How do you stay healthy?",
      "Do you exercise regularly?",
      "Have you ever been seriously ill?",
      "What do you do when you feel unwell?",
    ],
    part2CueCard:
      "Describe a time when you were ill. You should say: what illness you had, when it happened, how you recovered, and explain how it affected your life.",
    part3Questions: [
      "How has healthcare changed over the years?",
      "Should healthcare be free for everyone?",
      "What are the biggest health concerns today?",
      "How can people be encouraged to live healthier lives?",
    ],
  },
  {
    id: "fitness",
    name: "Fitness",
    category: "Lifestyle",
    part1Questions: [
      "Do you exercise regularly?",
      "What kind of exercise do you do?",
      "Do you prefer exercising alone or with others?",
      "Have you ever been to a gym?",
      "Do you think exercise is important?",
    ],
    part2CueCard:
      "Describe a form of exercise you enjoy. You should say: what it is, how often you do it, where you do it, and explain why you enjoy it.",
    part3Questions: [
      "Why do some people not exercise enough?",
      "Should physical education be compulsory in schools?",
      "How has the fitness industry changed?",
      "Do you think people are becoming less healthy?",
    ],
  },
  {
    id: "clothes",
    name: "Clothes",
    category: "Lifestyle",
    part1Questions: [
      "What kind of clothes do you usually wear?",
      "Do you prefer comfortable or fashionable clothes?",
      "How important is fashion to you?",
      "Do you prefer shopping for clothes online or in stores?",
      "Have your clothing preferences changed over the years?",
    ],
    part2CueCard:
      "Describe an item of clothing you wear often. You should say: what it is, when you bought it, what it looks like, and explain why you like wearing it.",
    part3Questions: [
      "How has fashion changed over the years?",
      "Do you think people spend too much money on clothes?",
      "Should there be more sustainable fashion?",
      "How does clothing reflect culture?",
    ],
  },
  {
    id: "colors",
    name: "Colors",
    category: "Lifestyle",
    part1Questions: [
      "What is your favorite color?",
      "Do you prefer bright or dark colors?",
      "Did you have a favorite color as a child?",
      "Do colors affect your mood?",
      "Are there any colors you dislike?",
    ],
    part2CueCard:
      "Describe a color you like. You should say: what color it is, where you often see it, what it reminds you of, and explain why you like it.",
    part3Questions: [
      "Do different colors have different meanings in your culture?",
      "How do companies use colors in marketing?",
      "Should buildings be colorful?",
      "How do colors affect people's behavior?",
    ],
  },

  // ========== People 人物 ==========
  {
    id: "family",
    name: "Family",
    category: "People",
    part1Questions: [
      "Do you have a large family?",
      "Who are you closest to in your family?",
      "How often do you see your family?",
      "Do you enjoy family gatherings?",
      "Has your family influenced you?",
    ],
    part2CueCard:
      "Describe a family member you are close to. You should say: who this person is, how often you see them, what you do together, and explain why you are close to them.",
    part3Questions: [
      "How have families changed in recent years?",
      "Do you think family relationships are important?",
      "Should elderly people live with their children?",
      "How might families change in the future?",
    ],
  },
  {
    id: "friends",
    name: "Friends",
    category: "People",
    part1Questions: [
      "Do you have many friends?",
      "Who is your best friend?",
      "How often do you see your friends?",
      "Do you prefer having many friends or a few close ones?",
      "How did you meet your best friend?",
    ],
    part2CueCard:
      "Describe a good friend. You should say: who this person is, how you met, what you do together, and explain why they are a good friend.",
    part3Questions: [
      "How has social media affected friendships?",
      "Do you think it's harder to make friends as an adult?",
      "What qualities make a good friend?",
      "Can online friends be as close as real-life friends?",
    ],
  },
  {
    id: "teachers",
    name: "Teachers",
    category: "People",
    part1Questions: [
      "Do you have a favorite teacher?",
      "What qualities make a good teacher?",
      "Would you like to be a teacher?",
      "How has teaching changed over the years?",
      "Do you keep in touch with any of your teachers?",
    ],
    part2CueCard:
      "Describe a teacher who influenced you. You should say: who this teacher was, what they taught, what made them special, and explain how they influenced you.",
    part3Questions: [
      "How has the role of teachers changed over the years?",
      "Do you think teachers are respected enough?",
      "Should teachers be paid more?",
      "How might teaching change in the future?",
    ],
  },
  {
    id: "neighbors",
    name: "Neighbors",
    category: "People",
    part1Questions: [
      "Do you know your neighbors?",
      "How often do you see your neighbors?",
      "Do you have a good relationship with your neighbors?",
      "What makes a good neighbor?",
      "Have you ever had a problem with a neighbor?",
    ],
    part2CueCard:
      "Describe a good neighbor you have. You should say: who this person is, how often you see them, what they are like, and explain why they are a good neighbor.",
    part3Questions: [
      "How have neighborhood relationships changed over the years?",
      "Do you think it's important to know your neighbors?",
      "How can communities be made stronger?",
      "What are the benefits of living in a close-knit community?",
    ],
  },

  // ========== Events 事件 ==========
  {
    id: "celebrations",
    name: "Celebrations",
    category: "Events",
    part1Questions: [
      "How do you usually celebrate special occasions?",
      "What is the most important celebration in your country?",
      "Do you enjoy attending celebrations?",
      "What was the last celebration you attended?",
      "How do celebrations differ between generations?",
    ],
    part2CueCard:
      "Describe a celebration you attended. You should say: what the celebration was, when it took place, what happened, and explain why it was memorable.",
    part3Questions: [
      "Why are celebrations important?",
      "How have celebrations changed over the years?",
      "Should governments fund public celebrations?",
      "Do you think celebrations are becoming too commercial?",
    ],
  },
  {
    id: "festivals",
    name: "Festivals",
    category: "Events",
    part1Questions: [
      "Are there many festivals in your country?",
      "What is your favorite festival?",
      "How do you usually celebrate festivals?",
      "Do you think festivals are important?",
      "Have festivals changed compared to the past?",
    ],
    part2CueCard:
      "Describe a festival in your country. You should say: what festival it is, when it takes place, how people celebrate it, and explain why it is important.",
    part3Questions: [
      "Why are festivals important to culture?",
      "How has globalization affected local festivals?",
      "Should traditional festivals be preserved?",
      "How might festivals change in the future?",
    ],
  },
  {
    id: "special-events",
    name: "Special Events",
    category: "Events",
    part1Questions: [
      "What events do you remember most?",
      "Do you like attending events?",
      "What was the last event you attended?",
      "Do you prefer big or small events?",
      "How do you prepare for special events?",
    ],
    part2CueCard:
      "Describe a special event you attended. You should say: what the event was, when it took place, what happened there, and explain why it was special to you.",
    part3Questions: [
      "Why do people attend events?",
      "How have events changed over the years?",
      "Should events be environmentally friendly?",
      "How might events change in the future?",
    ],
  },

  // ========== Objects 物品 ==========
  {
    id: "gifts",
    name: "Gifts",
    category: "Objects",
    part1Questions: [
      "Do you like giving gifts?",
      "What was the last gift you gave someone?",
      "What was the best gift you received?",
      "Do you prefer giving or receiving gifts?",
      "Is it difficult to choose gifts?",
    ],
    part2CueCard:
      "Describe a memorable gift you received. You should say: what the gift was, who gave it to you, when you received it, and explain why it was memorable.",
    part3Questions: [
      "Why do people give gifts?",
      "Has the way people give gifts changed?",
      "Should gifts be expensive?",
      "Is gift-giving important in your culture?",
    ],
  },
  {
    id: "photographs",
    name: "Photographs",
    category: "Objects",
    part1Questions: [
      "Do you like taking photographs?",
      "How often do you take photos?",
      "Do you prefer taking photos with a phone or camera?",
      "Do you like being photographed?",
      "What do you usually take photos of?",
    ],
    part2CueCard:
      "Describe a photograph that is important to you. You should say: what is in the photograph, when it was taken, who took it, and explain why it is important to you.",
    part3Questions: [
      "Why do people like taking photographs?",
      "How has photography changed with technology?",
      "Should people be allowed to photograph anything?",
      "Do you think photographs are reliable evidence?",
    ],
  },
  {
    id: "possessions",
    name: "Possessions",
    category: "Objects",
    part1Questions: [
      "What is your most valuable possession?",
      "Do you have anything you would never sell?",
      "What possession could you not live without?",
      "Do you prefer buying things or experiences?",
      "Are you attached to your possessions?",
    ],
    part2CueCard:
      "Describe something you own that is important to you. You should say: what it is, how you got it, how long you have had it, and explain why it is important to you.",
    part3Questions: [
      "Why do people become attached to possessions?",
      "Do you think people own too many things?",
      "Should people be more environmentally conscious about what they buy?",
      "How might attitudes towards possessions change?",
    ],
  },

  // ========== Abstract 抽象 ==========
  {
    id: "happiness",
    name: "Happiness",
    category: "Abstract",
    part1Questions: [
      "What makes you happy?",
      "Are you a happy person?",
      "Do you think happiness is important?",
      "Can money buy happiness?",
      "What was the happiest day of your life?",
    ],
    part2CueCard:
      "Describe something that makes you happy. You should say: what it is, how often you do it, who you do it with, and explain why it makes you happy.",
    part3Questions: [
      "What is the key to happiness?",
      "Are people in your country generally happy?",
      "Does happiness change with age?",
      "Should the government try to make people happier?",
    ],
  },
  {
    id: "success",
    name: "Success",
    category: "Abstract",
    part1Questions: [
      "How do you define success?",
      "What is your greatest success?",
      "Do you think you are successful?",
      "What does success mean in your culture?",
      "Is success important to you?",
    ],
    part2CueCard:
      "Describe a successful person you know. You should say: who this person is, how you know them, what they have achieved, and explain why you consider them successful.",
    part3Questions: [
      "What qualities make a person successful?",
      "Is success always positive?",
      "Do you think success is measured differently in different cultures?",
      "Should schools teach students about success?",
    ],
  },
  {
    id: "change",
    name: "Change",
    category: "Abstract",
    part1Questions: [
      "Do you like change?",
      "Have you experienced any big changes recently?",
      "How do you adapt to change?",
      "Do you think change is good?",
      "What would you like to change about your life?",
    ],
    part2CueCard:
      "Describe a big change in your life. You should say: what the change was, when it happened, how it affected you, and explain how you adapted to it.",
    part3Questions: [
      "Why do some people resist change?",
      "How has the pace of change affected society?",
      "Should people embrace change?",
      "How might life change in the next 50 years?",
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

export function getTopicsByCategory(category: string): Topic[] {
  return TOPICS.filter((t) => t.category === category);
}
