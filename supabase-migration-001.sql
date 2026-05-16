-- EchoLingo Phase 3 Migration: Admin, Topics, Learning Progress
-- Run this AFTER the initial supabase-schema.sql

-- ============================================================
-- 1. Profiles table (user roles)
-- ============================================================

CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS for profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Admins can view all profiles (using a function to check role)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Admins can update all profiles"
  ON profiles FOR UPDATE
  USING (public.is_admin());

-- ============================================================
-- 2. Topics table (migrated from hardcoded topics.ts)
-- ============================================================

CREATE TABLE IF NOT EXISTS topics (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  part1_questions JSONB DEFAULT '[]',
  part2_cue_card TEXT,
  part3_questions JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for topics (public read, admin write)
ALTER TABLE topics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active topics"
  ON topics FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can manage topics"
  ON topics FOR ALL
  USING (public.is_admin());

-- Seed topics from the hardcoded data
INSERT INTO topics (id, name, category, part1_questions, part2_cue_card, part3_questions) VALUES
  ('hometown', 'Hometown', 'Place',
    '["Where is your hometown?","What do you like about your hometown?","How long have you lived there?","Has your hometown changed much over the years?","Would you recommend your hometown to tourists?"]',
    'Describe your hometown. You should say: where it is, what it is known for, what you like and dislike about it, and explain why it is special to you.',
    '["How do cities in your country differ from each other?","What are the advantages of living in a big city?","Do you think people will continue to move to cities in the future?","How has urbanization affected your country?"]'
  ),
  ('accommodation', 'Accommodation', 'Place',
    '["Where do you live?","What kind of accommodation do you live in?","Do you like your current accommodation?","What would you like to change about your home?","Is there anything you would like to add to your home?"]',
    'Describe your ideal home. You should say: where it would be, what it would look like, what rooms it would have, and explain why this would be your ideal home.',
    '["How has housing changed in your country in recent years?","Do you think it is better to rent or buy a home?","What are the differences between living in the city and the countryside?","How do you think housing will change in the future?"]'
  ),
  ('favorite-place', 'Favorite Place', 'Place',
    '["Do you have a favorite place to visit?","How often do you go there?","What do you do there?","Who do you usually go there with?","When did you first visit this place?"]',
    'Describe a place you like to visit. You should say: where it is, how often you go there, what you do there, and explain why you enjoy visiting this place.',
    '["Why do people like to visit certain places?","How has tourism changed in your country?","What makes a place attractive to tourists?","Should governments invest more in tourism?"]'
  ),
  ('work-study', 'Work or Study', 'Life',
    '["Do you work or study?","What do you do for work?","What are you studying?","Do you enjoy your work/studies?","What are your future career plans?"]',
    'Describe your job or studies. You should say: what you do, why you chose this field, what you find most interesting about it, and explain how it affects your daily life.',
    '["How has the job market changed in recent years?","Do you think education is important for success?","What skills are most important in the modern workplace?","How might technology change the nature of work in the future?"]'
  ),
  ('daily-routine', 'Daily Routine', 'Life',
    '["What is your daily routine?","Do you have a regular routine?","Has your routine changed compared to a few years ago?","What is the busiest part of your day?","Do you prefer mornings or evenings?"]',
    'Describe your typical day. You should say: what time you wake up, what activities you do throughout the day, what your evening is like, and explain whether you enjoy your routine.',
    '["How do routines differ between young and old people?","Do you think having a routine is important?","How has technology affected people daily routines?","Should work schedules be more flexible?"]'
  ),
  ('sleep', 'Sleep', 'Life',
    '["How many hours do you usually sleep?","Do you think sleep is important?","Do you take naps?","Have your sleeping habits changed over the years?","What helps you sleep better?"]',
    'Describe a time when you had difficulty sleeping. You should say: when it was, why you could not sleep, how you felt the next day, and explain how you dealt with the situation.',
    '["Why do some people have trouble sleeping?","How does sleep affect health?","Do you think modern lifestyle affects sleep quality?","Should companies consider employees sleep needs?"]'
  ),
  ('hobbies', 'Hobbies and Interests', 'Leisure',
    '["What do you do in your free time?","Do you have any hobbies?","How long have you been interested in your hobbies?","Do you prefer indoor or outdoor activities?","Have your hobbies changed over the years?"]',
    'Describe a hobby you enjoy. You should say: what it is, how often you do it, how you started it, and explain why you enjoy it.',
    '["Why do people need hobbies?","Do you think hobbies should be productive?","How have leisure activities changed with technology?","Should schools encourage students to have hobbies?"]'
  ),
  ('sports', 'Sports', 'Leisure',
    '["Do you like sports?","What is your favorite sport?","Did you play any sports as a child?","Do you prefer watching or playing sports?","Is there a sport you would like to try?"]',
    'Describe a sport you enjoy watching or playing. You should say: what it is, how often you do it, who you do it with, and explain why you enjoy it.',
    '["Why are some sports more popular than others?","Should sports be compulsory in schools?","How has professional sports changed over the years?","Do you think e-sports should be considered real sports?"]'
  ),
  ('music', 'Music', 'Leisure',
    '["Do you like music?","What kind of music do you listen to?","Do you play any musical instruments?","Has your taste in music changed over the years?","Do you prefer listening to music alone or with others?"]',
    'Describe a song or piece of music you like. You should say: what it is, when you first heard it, what it is about, and explain why you like it.',
    '["How has music changed over the decades?","Do you think music is an important part of culture?","Should children learn to play musical instruments?","How has technology affected the music industry?"]'
  ),
  ('reading', 'Reading', 'Leisure',
    '["Do you like reading?","What kind of books do you read?","Do you prefer physical books or e-books?","How often do you read?","What was the last book you read?"]',
    'Describe a book that influenced you. You should say: what book it is, when you read it, what it is about, and explain how it influenced you.',
    '["Why do some people prefer reading to watching movies?","Has the way people read changed with technology?","Should schools encourage students to read more?","Do you think reading will become less popular in the future?"]'
  ),
  ('movies', 'Movies', 'Leisure',
    '["Do you like watching movies?","What kind of movies do you prefer?","How often do you go to the cinema?","Do you prefer watching movies at home or in the cinema?","Who do you usually watch movies with?"]',
    'Describe your favorite movie. You should say: what it is, when you first watched it, what it is about, and explain why it is your favorite.',
    '["How has the film industry changed over the years?","Do you think streaming services are replacing cinemas?","Should there be more regulation of movie content?","How do movies influence society?"]'
  ),
  ('travel', 'Travel', 'Leisure',
    '["Do you like traveling?","Where was the last place you traveled to?","Do you prefer traveling alone or with others?","What kind of places do you like to visit?","Do you prefer domestic or international travel?"]',
    'Describe a memorable trip you took. You should say: where you went, when you went, who you went with, and explain why it was memorable.',
    '["How has tourism changed in your country?","What are the benefits of traveling?","Do you think mass tourism is harmful?","How might travel change in the future?"]'
  ),
  ('weather', 'Weather', 'Nature',
    '["What is the weather like in your country?","What is your favorite season? Why?","Does the weather affect your mood?","Do you check the weather forecast regularly?","Has the weather changed much in recent years?"]',
    'Describe your favorite type of weather. You should say: what it is, when it occurs, what activities you do in this weather, and explain why you like it.',
    '["How does weather affect people daily lives?","Do you think climate change is a serious issue?","How do different countries prepare for extreme weather?","Should the government do more to address climate change?"]'
  ),
  ('animals', 'Animals', 'Nature',
    '["Do you like animals?","Do you have any pets?","What is your favorite animal?","Are there any animals that are common in your country?","Did you have any pets as a child?"]',
    'Describe an interesting animal. You should say: what it is, where it lives, what makes it interesting, and explain how you learned about it.',
    '["Why do some people keep exotic pets?","Should animals be kept in zoos?","How has the relationship between humans and animals changed?","What can be done to protect endangered species?"]'
  ),
  ('nature', 'Nature', 'Nature',
    '["Do you like spending time in nature?","How often do you spend time outdoors?","What is your favorite natural place?","Are there many parks near your home?","Do you think it is important to protect nature?"]',
    'Describe a beautiful natural place you have visited. You should say: where it is, when you visited it, what you saw there, and explain why you found it beautiful.',
    '["Why is it important to protect natural environments?","How has urbanization affected nature?","What can individuals do to help the environment?","Should children spend more time in nature?"]'
  ),
  ('flowers', 'Flowers', 'Nature',
    '["Do you like flowers?","What is your favorite flower?","Do you give flowers as gifts?","Are flowers important in your culture?","Do you grow any plants at home?"]',
    'Describe a flower that is important in your country. You should say: what it is, where it grows, when it blooms, and explain why it is important.',
    '["Why are flowers important in different cultures?","Should cities have more green spaces?","How has flower cultivation changed over the years?","Do you think people should grow their own flowers?"]'
  ),
  ('technology', 'Technology', 'Modern Life',
    '["Do you use technology often?","What is your favorite piece of technology?","How has technology changed your life?","Do you think people spend too much time on their phones?","What technology would you like to see in the future?"]',
    'Describe a piece of technology you find useful. You should say: what it is, when you first used it, what you use it for, and explain why it is important to you.',
    '["How has technology changed the way people communicate?","Do you think children should use technology from a young age?","What are the negative effects of technology on society?","Will artificial intelligence replace human workers?"]'
  ),
  ('social-media', 'Social Media', 'Modern Life',
    '["Do you use social media?","Which social media platforms do you use?","How much time do you spend on social media?","Do you think social media is beneficial?","Has your use of social media changed over the years?"]',
    'Describe a social media platform you often use. You should say: what it is, how you use it, what you like about it, and explain how it has affected your life.',
    '["How has social media affected relationships?","Should social media companies be regulated?","Do you think social media is addictive?","How might social media change in the future?"]'
  ),
  ('shopping', 'Shopping', 'Modern Life',
    '["Do you enjoy shopping?","How often do you go shopping?","Do you prefer shopping online or in stores?","What was the last thing you bought?","Do you like buying things on sale?"]',
    'Describe a memorable shopping experience. You should say: where you went, what you bought, who you were with, and explain why it was memorable.',
    '["How has online shopping changed retail?","Do you think people buy too many things?","Should there be more regulation of advertising?","How might shopping change in the future?"]'
  ),
  ('transport', 'Transport', 'Modern Life',
    '["How do you usually travel?","What is your favorite mode of transport?","Is public transport good in your city?","Do you prefer driving or being a passenger?","Have you ever been on a long journey?"]',
    'Describe a memorable journey you have taken. You should say: where you went, how you traveled, who you were with, and explain why it was memorable.',
    '["How has transportation changed over the years?","What are the benefits of public transport?","Should governments invest more in transport infrastructure?","How might transportation change in the future?"]'
  ),
  ('internet', 'Internet', 'Modern Life',
    '["How often do you use the internet?","What do you use the internet for?","Do you think the internet is important?","Has the internet changed your life?","Can you imagine life without the internet?"]',
    'Describe how the internet has changed your life. You should say: when you first started using it, how you use it, what you use it for, and explain how it has affected your daily life.',
    '["How has the internet changed the way people learn?","Do you think the internet has more advantages or disadvantages?","Should the internet be censored?","How might the internet change in the future?"]'
  ),
  ('food', 'Food', 'Lifestyle',
    '["What is your favorite food?","Do you prefer home-cooked meals or eating out?","What kind of food is popular in your country?","Do you enjoy cooking?","Have your eating habits changed over the years?"]',
    'Describe a traditional dish from your country. You should say: what it is, how it is made, when people usually eat it, and explain why it is significant.',
    '["How has globalization affected food culture?","Do you think fast food is a serious health concern?","Should governments regulate what people eat?","How might food production change in the future?"]'
  ),
  ('health', 'Health', 'Lifestyle',
    '["Are you a healthy person?","How do you stay healthy?","Do you exercise regularly?","Have you ever been seriously ill?","What do you do when you feel unwell?"]',
    'Describe a time when you were ill. You should say: what illness you had, when it happened, how you recovered, and explain how it affected your life.',
    '["How has healthcare changed over the years?","Should healthcare be free for everyone?","What are the biggest health concerns today?","How can people be encouraged to live healthier lives?"]'
  ),
  ('fitness', 'Fitness', 'Lifestyle',
    '["Do you exercise regularly?","What kind of exercise do you do?","Do you prefer exercising alone or with others?","Have you ever been to a gym?","Do you think exercise is important?"]',
    'Describe a form of exercise you enjoy. You should say: what it is, how often you do it, where you do it, and explain why you enjoy it.',
    '["Why do some people not exercise enough?","Should physical education be compulsory in schools?","How has the fitness industry changed?","Do you think people are becoming less healthy?"]'
  ),
  ('clothes', 'Clothes', 'Lifestyle',
    '["What kind of clothes do you usually wear?","Do you prefer comfortable or fashionable clothes?","How important is fashion to you?","Do you prefer shopping for clothes online or in stores?","Have your clothing preferences changed over the years?"]',
    'Describe an item of clothing you wear often. You should say: what it is, when you bought it, what it looks like, and explain why you like wearing it.',
    '["How has fashion changed over the years?","Do you think people spend too much money on clothes?","Should there be more sustainable fashion?","How does clothing reflect culture?"]'
  ),
  ('colors', 'Colors', 'Lifestyle',
    '["What is your favorite color?","Do you prefer bright or dark colors?","Did you have a favorite color as a child?","Do colors affect your mood?","Are there any colors you dislike?"]',
    'Describe a color you like. You should say: what color it is, where you often see it, what it reminds you of, and explain why you like it.',
    '["Do different colors have different meanings in your culture?","How do companies use colors in marketing?","Should buildings be colorful?","How do colors affect people behavior?"]'
  ),
  ('family', 'Family', 'People',
    '["Do you have a large family?","Who are you closest to in your family?","How often do you see your family?","Do you enjoy family gatherings?","Has your family influenced you?"]',
    'Describe a family member you are close to. You should say: who this person is, how often you see them, what you do together, and explain why you are close to them.',
    '["How have families changed in recent years?","Do you think family relationships are important?","Should elderly people live with their children?","How might families change in the future?"]'
  ),
  ('friends', 'Friends', 'People',
    '["Do you have many friends?","Who is your best friend?","How often do you see your friends?","Do you prefer having many friends or a few close ones?","How did you meet your best friend?"]',
    'Describe a good friend. You should say: who this person is, how you met, what you do together, and explain why they are a good friend.',
    '["How has social media affected friendships?","Do you think it is harder to make friends as an adult?","What qualities make a good friend?","Can online friends be as close as real-life friends?"]'
  ),
  ('teachers', 'Teachers', 'People',
    '["Do you have a favorite teacher?","What qualities make a good teacher?","Would you like to be a teacher?","How has teaching changed over the years?","Do you keep in touch with any of your teachers?"]',
    'Describe a teacher who influenced you. You should say: who this teacher was, what they taught, what made them special, and explain how they influenced you.',
    '["How has the role of teachers changed over the years?","Do you think teachers are respected enough?","Should teachers be paid more?","How might teaching change in the future?"]'
  ),
  ('neighbors', 'Neighbors', 'People',
    '["Do you know your neighbors?","How often do you see your neighbors?","Do you have a good relationship with your neighbors?","What makes a good neighbor?","Have you ever had a problem with a neighbor?"]',
    'Describe a good neighbor you have. You should say: who this person is, how often you see them, what they are like, and explain why they are a good neighbor.',
    '["How have neighborhood relationships changed over the years?","Do you think it is important to know your neighbors?","How can communities be made stronger?","What are the benefits of living in a close-knit community?"]'
  ),
  ('celebrations', 'Celebrations', 'Events',
    '["How do you usually celebrate special occasions?","What is the most important celebration in your country?","Do you enjoy attending celebrations?","What was the last celebration you attended?","How do celebrations differ between generations?"]',
    'Describe a celebration you attended. You should say: what the celebration was, when it took place, what happened, and explain why it was memorable.',
    '["Why are celebrations important?","How have celebrations changed over the years?","Should governments fund public celebrations?","Do you think celebrations are becoming too commercial?"]'
  ),
  ('festivals', 'Festivals', 'Events',
    '["Are there many festivals in your country?","What is your favorite festival?","How do you usually celebrate festivals?","Do you think festivals are important?","Have festivals changed compared to the past?"]',
    'Describe a festival in your country. You should say: what festival it is, when it takes place, how people celebrate it, and explain why it is important.',
    '["Why are festivals important to culture?","How has globalization affected local festivals?","Should traditional festivals be preserved?","How might festivals change in the future?"]'
  ),
  ('special-events', 'Special Events', 'Events',
    '["What events do you remember most?","Do you like attending events?","What was the last event you attended?","Do you prefer big or small events?","How do you prepare for special events?"]',
    'Describe a special event you attended. You should say: what the event was, when it took place, what happened there, and explain why it was special to you.',
    '["Why do people attend events?","How have events changed over the years?","Should events be environmentally friendly?","How might events change in the future?"]'
  ),
  ('gifts', 'Gifts', 'Objects',
    '["Do you like giving gifts?","What was the last gift you gave someone?","What was the best gift you received?","Do you prefer giving or receiving gifts?","Is it difficult to choose gifts?"]',
    'Describe a memorable gift you received. You should say: what the gift was, who gave it to you, when you received it, and explain why it was memorable.',
    '["Why do people give gifts?","Has the way people give gifts changed?","Should gifts be expensive?","Is gift-giving important in your culture?"]'
  ),
  ('photographs', 'Photographs', 'Objects',
    '["Do you like taking photographs?","How often do you take photos?","Do you prefer taking photos with a phone or camera?","Do you like being photographed?","What do you usually take photos of?"]',
    'Describe a photograph that is important to you. You should say: what is in the photograph, when it was taken, who took it, and explain why it is important to you.',
    '["Why do people like taking photographs?","How has photography changed with technology?","Should people be allowed to photograph anything?","Do you think photographs are reliable evidence?"]'
  ),
  ('possessions', 'Possessions', 'Objects',
    '["What is your most valuable possession?","Do you have anything you would never sell?","What possession could you not live without?","Do you prefer buying things or experiences?","Are you attached to your possessions?"]',
    'Describe something you own that is important to you. You should say: what it is, how you got it, how long you have had it, and explain why it is important to you.',
    '["Why do people become attached to possessions?","Do you think people own too many things?","Should people be more environmentally conscious about what they buy?","How might attitudes towards possessions change?"]'
  ),
  ('happiness', 'Happiness', 'Abstract',
    '["What makes you happy?","Are you a happy person?","Do you think happiness is important?","Can money buy happiness?","What was the happiest day of your life?"]',
    'Describe something that makes you happy. You should say: what it is, how often you do it, who you do it with, and explain why it makes you happy.',
    '["What is the key to happiness?","Are people in your country generally happy?","Does happiness change with age?","Should the government try to make people happier?"]'
  ),
  ('success', 'Success', 'Abstract',
    '["How do you define success?","What is your greatest success?","Do you think you are successful?","What does success mean in your culture?","Is success important to you?"]',
    'Describe a successful person you know. You should say: who this person is, how you know them, what they have achieved, and explain why you consider them successful.',
    '["What qualities make a person successful?","Is success always positive?","Do you think success is measured differently in different cultures?","Should schools teach students about success?"]'
  ),
  ('change', 'Change', 'Abstract',
    '["Do you like change?","Have you experienced any big changes recently?","How do you adapt to change?","Do you think change is good?","What would you like to change about your life?"]',
    'Describe a big change in your life. You should say: what the change was, when it happened, how it affected you, and explain how you adapted to it.',
    '["Why do some people resist change?","How has the pace of change affected society?","Should people embrace change?","How might life change in the next 50 years?"]'
  )
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 3. Learning Progress table
-- ============================================================

CREATE TABLE IF NOT EXISTS learning_progress (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  topic_id TEXT NOT NULL,
  part TEXT CHECK (part IN ('part1', 'part2', 'part3')),
  best_band DECIMAL(2,1),
  attempt_count INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, topic_id, part)
);

-- RLS for learning_progress
ALTER TABLE learning_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own progress"
  ON learning_progress FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own progress"
  ON learning_progress FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own progress"
  ON learning_progress FOR UPDATE
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_learning_progress_user_id ON learning_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_learning_progress_topic_id ON learning_progress(topic_id);
