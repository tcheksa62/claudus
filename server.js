const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const PORT = process.env.PORT || 3000;

app.use(express.static('public'));
app.use(express.json());

let words = [];
let wordOfTheDay = '';
const multiplayerSessions = new Map();
const soloSessions = new Map();

function loadWords() {
  const content = fs.readFileSync('words.txt', 'utf-8');

  // Verb conjugation endings to filter out
  const conjugationEndings = [
    // Passé simple (1er groupe) - plural forms
    'AMES', 'ATES', 'ERENT',
    // Passé simple (2e et 3e groupe)
    'IMES', 'ITES', 'IRENT', 'UMES', 'UTES', 'URENT',
    // Imparfait
    'AIENT', 'IIONS', 'IIEZ',
    // Futur
    'ERONS', 'EREZ', 'ERONT', 'IRONS', 'IREZ', 'IRONT',
    // Conditionnel
    'ERAIS', 'ERAIT', 'ERIONS', 'ERIEZ', 'ERAIENT',
    'IRAIS', 'IRAIT', 'IRIONS', 'IRIEZ', 'IRAIENT',
    // Subjonctif imparfait
    'ASSES', 'ASSENT', 'ASSIEZ', 'ASSIONS',
    'ISSES', 'ISSENT', 'ISSIEZ', 'ISSIONS',
    'USSES', 'USSENT', 'USSIEZ', 'USSIONS',
    // Participes présents (2e groupe)
    'ISSANT', 'ISSANTE', 'ISSANTS', 'ISSANTES',
    // Pluriels de participes passés féminins
    'EEES',
    // Futur/Conditionnel singulier
    'ERAI', 'ERAS',
    // Passé simple singulier patterns (verbes en -ER: -AI, -AS, -AT, -A)
    'ISAI', 'ISAS', 'ISAT',
    'IFIAI', 'IFIAS', 'IFIAT',
    'STAI', 'STAS', 'STAT',
    // Verbes en -YER passé simple
    'OYAMES', 'OYATES', 'OYERENT',
    'AYAMES', 'AYATES', 'AYERENT',
    'UYAMES', 'UYATES', 'UYERENT'
  ];

  // Regex patterns for passé simple detection (more precise)
  const passeSimplePatterns = [
    /[BCDFGHJKLMNPQRSTVWXZ]{2}AI$/,  // consonant cluster + AI (CONTRISTA -> TRISTAI)
    /[BCDFGHJKLMNPQRSTVWXZ]{2}AS$/,  // consonant cluster + AS
    /[BCDFGHJKLMNPQRSTVWXZ]{2}AT$/,  // consonant cluster + AT
    /[AEIOU][BCDFGHJKLMNPQRSTVWXZ]AI$/,  // vowel+consonant+AI
    /[AEIOU][BCDFGHJKLMNPQRSTVWXZ]AS$/,  // vowel+consonant+AS
    /[AEIOU][BCDFGHJKLMNPQRSTVWXZ]AT$/,  // vowel+consonant+AT
    /FIAI$/,  // -fier verbs
    /FIAS$/,
    /FIAT$/,
  ];

  // Common English words to filter out (that aren't also French words)
  const englishWords = new Set([
    'ABOUT', 'AFTER', 'AGAIN', 'THEIR', 'THERE', 'THESE', 'THINK', 'THING', 'THINGS',
    'THREE', 'THROUGH', 'TODAY', 'TOGETHER', 'UNDER', 'UNTIL', 'WATER', 'WHERE',
    'WHICH', 'WHILE', 'WHITE', 'WHOLE', 'WHOSE', 'WORLD', 'WOULD', 'WRITE', 'WRONG',
    'YEARS', 'YOUNG', 'YOURSELF', 'ABOVE', 'ACROSS', 'AGAINST', 'ALMOST', 'ALONG',
    'ALREADY', 'ALWAYS', 'AMONG', 'ANOTHER', 'ANSWER', 'AROUND', 'ASKED', 'AWAY',
    'BACK', 'BECAUSE', 'BECOME', 'BEEN', 'BEFORE', 'BEGAN', 'BEGIN', 'BEHIND',
    'BEING', 'BELIEVE', 'BELOW', 'BEST', 'BETTER', 'BETWEEN', 'BLACK', 'BOTH',
    'BRING', 'BROUGHT', 'BUILD', 'BUILT', 'BUSINESS', 'CALLED', 'CAME', 'CANNOT',
    'CERTAIN', 'CHANGE', 'CHANGED', 'CHILDREN', 'CITY', 'CLOSE', 'COME', 'COMES',
    'COULD', 'COUNTRY', 'COURSE', 'DAYS', 'DEATH', 'DEVELOPMENT', 'DIFFERENT',
    'DOES', 'DOING', 'DONE', 'DOWN', 'DURING', 'EACH', 'EARLY', 'EARTH', 'EITHER',
    'ENOUGH', 'EVEN', 'EVER', 'EVERY', 'EXAMPLE', 'EYES', 'FACE', 'FACT', 'FAMILY',
    'FEEL', 'FEET', 'FIELD', 'FIND', 'FIRST', 'FIVE', 'FOLLOW', 'FOOD', 'FORM',
    'FOUND', 'FOUR', 'FREE', 'FRIEND', 'FROM', 'FULL', 'GAVE', 'GENERAL', 'GIVE',
    'GIVEN', 'GOING', 'GOOD', 'GOVERNMENT', 'GREAT', 'GROUP', 'HAND', 'HANDS',
    'HARD', 'HAVE', 'HEAD', 'HEARD', 'HEART', 'HELP', 'HERE', 'HIGH', 'HIMSELF',
    'HISTORY', 'HOME', 'HOUSE', 'HUMAN', 'IMPORTANT', 'INTO', 'ITSELF', 'JUST',
    'KEEP', 'KIND', 'KNEW', 'KNOW', 'KNOWN', 'LAND', 'LARGE', 'LAST', 'LATER',
    'LEAST', 'LEFT', 'LESS', 'LIFE', 'LIGHT', 'LIKE', 'LINE', 'LITTLE', 'LIVE',
    'LIVING', 'LONG', 'LOOK', 'LOOKED', 'LOOKING', 'MADE', 'MAKE', 'MAKING',
    'MANY', 'MATTER', 'MEAN', 'MEANS', 'MIGHT', 'MIND', 'MONEY', 'MORE', 'MOST',
    'MOTHER', 'MUCH', 'MUST', 'NAME', 'NATIONAL', 'NATURE', 'NEAR', 'NEED',
    'NEVER', 'NEWS', 'NEXT', 'NIGHT', 'NOTHING', 'NUMBER', 'OFTEN', 'ONCE',
    'ONLY', 'OPEN', 'ORDER', 'OTHER', 'OTHERS', 'OVER', 'PART', 'PARTY', 'PAST',
    'PEOPLE', 'PERHAPS', 'PLACE', 'PLAN', 'PLAY', 'POINT', 'POLITICAL', 'POSSIBLE',
    'POWER', 'PRESENT', 'PRESIDENT', 'PROBABLY', 'PROBLEM', 'PROGRAM', 'PUBLIC',
    'QUESTION', 'QUITE', 'READ', 'REALLY', 'REASON', 'RIGHT', 'RIVER', 'ROAD',
    'ROOM', 'SAID', 'SAME', 'SCHOOL', 'SECOND', 'SEEM', 'SEEMED', 'SEEMS', 'SEEN',
    'SEVERAL', 'SHALL', 'SHORT', 'SHOULD', 'SHOW', 'SHOWN', 'SIDE', 'SINCE',
    'SMALL', 'SOCIAL', 'SOME', 'SOMETHING', 'SOMETIMES', 'SOON', 'SOUTH', 'SPEAK',
    'SPECIAL', 'STAND', 'START', 'STATE', 'STATES', 'STILL', 'STORY', 'STREET',
    'STUDY', 'SUCH', 'SYSTEM', 'TAKE', 'TAKEN', 'TELL', 'THAN', 'THAT', 'THEM',
    'THEN', 'THEY', 'THIS', 'THOSE', 'THOUGHT', 'TIME', 'TIMES', 'TOLD', 'TOOK',
    'TRUE', 'TURN', 'TURNED', 'UNDER', 'UNITED', 'UPON', 'USED', 'USING', 'VERY',
    'WANT', 'WANTED', 'WATCH', 'WAYS', 'WEEK', 'WELL', 'WENT', 'WERE', 'WHAT',
    'WHEN', 'WILL', 'WITH', 'WITHIN', 'WITHOUT', 'WOMAN', 'WOMEN', 'WORD', 'WORDS',
    'WORK', 'WORKS', 'YEAR', 'YOUR', 'YOUTH', 'ZERO', 'LEVEL', 'LIGHT', 'LIKELY',
    'ACTUALLY', 'ADDING', 'ADDITIONAL', 'ADMINISTRATION', 'AHEAD', 'ALLOW',
    'ALTHOUGH', 'AMOUNT', 'ANALYSIS', 'AND', 'ANIMALS', 'APPEAR', 'APPLICATION',
    'APPROACH', 'AREA', 'AREAS', 'ARGUMENT', 'ARMS', 'ARMY', 'ART', 'ARTICLE',
    'ARTIST', 'ARTS', 'ASK', 'ASKING', 'ASSUME', 'ATTENTION', 'AUDIENCE',
    'AUTHOR', 'AUTHORITY', 'AVAILABLE', 'BAD', 'BASED', 'BASIC', 'BEAR', 'BEAT',
    'BEAUTIFUL', 'BEAUTY', 'BECAME', 'BED', 'BEGINNING', 'BEHAVIOR', 'BEYOND',
    'BIG', 'BILL', 'BILLION', 'BIT', 'BLOOD', 'BLUE', 'BOARD', 'BOAT', 'BODY',
    'BOOK', 'BOOKS', 'BORN', 'BOY', 'BOYS', 'BREAK', 'BRITISH', 'BROTHER',
    'BROWN', 'BUILDING', 'BUY', 'CALL', 'CALLS', 'CAR', 'CARD', 'CARE', 'CAREER',
    'CARRY', 'CASE', 'CASES', 'CAUSE', 'CENTER', 'CENTRAL', 'CENTURY', 'CHAIR',
    'CHAIRMAN', 'CHANCE', 'CHANGES', 'CHAPTER', 'CHARACTER', 'CHARGE', 'CHECK',
    'CHIEF', 'CHILD', 'CHOICE', 'CHURCH', 'CIVIL', 'CLAIM', 'CLASS', 'CLEAR',
    'CLEARLY', 'CLUB', 'COLD', 'COLLEGE', 'COLOR', 'COMING', 'COMMERCIAL',
    'COMMITTEE', 'COMMON', 'COMMUNITY', 'COMPANIES', 'COMPANY', 'COMPUTER',
    'CONCERN', 'CONCERNED', 'CONDITION', 'CONDITIONS', 'CONFERENCE', 'CONGRESS',
    'CONSIDER', 'CONTINUE', 'CONTROL', 'COST', 'COSTS', 'COUNCIL', 'COURT',
    'COVER', 'CREATE', 'CREATED', 'CREDIT', 'CURRENT', 'CUT', 'DAILY', 'DARK',
    'DATA', 'DATE', 'DAUGHTER', 'DAY', 'DEAL', 'DECIDED', 'DECISION', 'DEEP',
    'DEFENSE', 'DEGREE', 'DEMAND', 'DEPARTMENT', 'DESCRIBE', 'DESIGN', 'DESIGNED',
    'DESPITE', 'DETAIL', 'DETAILS', 'DETERMINE', 'DEVELOP', 'DEVELOPED', 'DID',
    'DIRECT', 'DIRECTION', 'DIRECTOR', 'DISCOVERED', 'DISCUSSION', 'DISEASE',
    'DISTANCE', 'DISTRICT', 'DOCTOR', 'DOOR', 'DOUBLE', 'DOUBT', 'DRAW', 'DRAWN',
    'DREAM', 'DRIVE', 'DROP', 'DROPPED', 'DUE', 'EASILY', 'EAST', 'EASY', 'ECONOMIC',
    'ECONOMY', 'EDGE', 'EDUCATION', 'EFFECT', 'EFFECTIVE', 'EFFECTS', 'EFFORT',
    'EFFORTS', 'EIGHT', 'ELECTION', 'ELEMENTS', 'ELSE', 'EMPLOYMENT', 'END',
    'ENDED', 'ENEMY', 'ENERGY', 'ENGLISH', 'ENJOY', 'ENTIRE', 'ENVIRONMENT',
    'EQUAL', 'EQUIPMENT', 'ESPECIALLY', 'ESTABLISHED', 'EUROPE', 'EUROPEAN',
    'EVENING', 'EVENT', 'EVENTS', 'EVIDENCE', 'EXACTLY', 'EXCEPT', 'EXCHANGE',
    'EXIST', 'EXPECT', 'EXPECTED', 'EXPERIENCE', 'EXPLAIN', 'EXPRESSION', 'EXTENT',
    'EXTRA', 'EXTREMELY', 'EYE', 'FACTOR', 'FACTORS', 'FAILED', 'FAIR', 'FAITH',
    'FALL', 'FALSE', 'FAR', 'FARM', 'FAST', 'FATHER', 'FEAR', 'FEATURES', 'FEDERAL',
    'FEELING', 'FEW', 'FIGURE', 'FIGURES', 'FILE', 'FILL', 'FILLED', 'FILM',
    'FINAL', 'FINALLY', 'FINANCIAL', 'FINE', 'FINISHED', 'FIRE', 'FIRM', 'FIT',
    'FLOOR', 'FLOW', 'FOCUS', 'FOLLOWING', 'FOOT', 'FOR', 'FORCE', 'FORCED',
    'FORCES', 'FOREIGN', 'FOREST', 'FORMER', 'FORMS', 'FORTH', 'FORWARD', 'FRANCE',
    'FRENCH', 'FRESH', 'FRONT', 'FUNCTION', 'FUND', 'FUNDS', 'FURTHER', 'FUTURE',
    'GAME', 'GAMES', 'GARDEN', 'GAS', 'GENERALLY', 'GET', 'GETTING', 'GIRL',
    'GIRLS', 'GLASS', 'GOD', 'GOES', 'GOLD', 'GONE', 'GOT', 'GOTTEN', 'GREEK',
    'GREEN', 'GREW', 'GROUND', 'GROUPS', 'GROW', 'GROWING', 'GROWTH', 'GUESS',
    'GUN', 'GUYS', 'HAIR', 'HALF', 'HALL', 'HANDLE', 'HAPPEN', 'HAPPENED', 'HAPPY',
    'HAS', 'HAD', 'HER', 'HIS', 'HIM', 'HERSELF', 'HOLD', 'HOLDING', 'HOLE',
    'HOPE', 'HORSE', 'HOSPITAL', 'HOT', 'HOTEL', 'HOUR', 'HOURS', 'HOW', 'HOWEVER',
    'HUGE', 'HUNDRED', 'HUSBAND', 'IDEA', 'IDEAS', 'IDENTIFIED', 'IMAGE', 'IMAGINE',
    'IMMEDIATELY', 'IMPACT', 'IMPROVE', 'INCLUDE', 'INCLUDED', 'INCLUDING',
    'INCOME', 'INCREASE', 'INCREASED', 'INDEED', 'INDEPENDENT', 'INDIVIDUAL',
    'INDIVIDUALS', 'INDUSTRY', 'INFLUENCE', 'INFORMATION', 'INSIDE', 'INSTEAD',
    'INSTITUTIONS', 'INTEREST', 'INTERESTED', 'INTERESTING', 'INTERESTS',
    'INTERNATIONAL', 'INTERVIEW', 'INVOLVED', 'ISLAND', 'ISSUE', 'ISSUES', 'JOB',
    'JOBS', 'JOHN', 'JOIN', 'JOINED', 'JUDGE', 'JUDGMENT', 'JUSTICE', 'KILLED',
    'KING', 'KITCHEN', 'KNOWLEDGE', 'LACK', 'LADY', 'LAKE', 'LANGUAGE', 'LAW',
    'LAWS', 'LAWYER', 'LAY', 'LEAD', 'LEADER', 'LEADERS', 'LEADERSHIP', 'LEADING',
    'LEARN', 'LEARNED', 'LEARNING', 'LEAVE', 'LED', 'LEGAL', 'LENGTH', 'LET',
    'LETTER', 'LETTERS', 'LIES', 'LIST', 'LISTEN', 'LITERATURE', 'LOCAL', 'LOOK',
    'LORD', 'LOSE', 'LOSS', 'LOST', 'LOVE', 'LOW', 'LOWER', 'LUNCH', 'MACHINE',
    'MAGAZINE', 'MAIN', 'MAINTAIN', 'MAJOR', 'MAJORITY', 'MAN', 'MANAGEMENT',
    'MANAGER', 'MARKET', 'MARRIAGE', 'MARRIED', 'MASS', 'MASTER', 'MATCH',
    'MATERIAL', 'MATERIALS', 'MEANING', 'MEASURE', 'MEASURES', 'MEDIA', 'MEDICAL',
    'MEET', 'MEETING', 'MEMBER', 'MEMBERS', 'MEMORY', 'MEN', 'MENTIONED', 'MESSAGE',
    'METHOD', 'METHODS', 'MIDDLE', 'MIGHT', 'MILITARY', 'MILLION', 'MINUTES',
    'MISS', 'MISSING', 'MODEL', 'MODERN', 'MOMENT', 'MONTH', 'MONTHS', 'MORAL',
    'MORNING', 'MOTHER', 'MOTION', 'MOUNTAIN', 'MOUTH', 'MOVE', 'MOVED', 'MOVEMENT',
    'MOVIE', 'MOVING', 'MRS', 'MURDER', 'MUSEUM', 'MUSIC', 'MYSELF', 'NATURAL',
    'NECESSARY', 'NEEDED', 'NEEDS', 'NETWORK', 'NEW', 'NONE', 'NOR', 'NORMAL',
    'NORTH', 'NOT', 'NOTE', 'NOTED', 'NOTICE', 'NOVEL', 'NOW', 'NUMBERS', 'OBJECT',
    'OBSERVE', 'OBTAIN', 'OBVIOUSLY', 'OCCUR', 'OFFER', 'OFFERED', 'OFFICE',
    'OFFICER', 'OFFICERS', 'OFFICIAL', 'OFFICIALS', 'OLD', 'OLDER', 'ONE', 'ONES',
    'OPERATION', 'OPERATIONS', 'OPINION', 'OPPORTUNITY', 'OPPOSITION', 'OPTIONS',
    'ORGANIZATION', 'ORGANIZATIONS', 'ORIGINAL', 'OUR', 'OUT', 'OUTSIDE', 'OWN',
    'OWNER', 'PAGE', 'PAGES', 'PAID', 'PAINTING', 'PAIR', 'PAPER', 'PAPERS',
    'PARENTS', 'PARK', 'PART', 'PARTICULAR', 'PARTICULARLY', 'PARTIES', 'PARTS',
    'PASS', 'PASSED', 'PAST', 'PATH', 'PATTERN', 'PAY', 'PEACE', 'PERFORMANCE',
    'PERIOD', 'PERSON', 'PERSONAL', 'PHONE', 'PHYSICAL', 'PICK', 'PICTURE',
    'PICTURES', 'PIECE', 'PIECES', 'PLACES', 'PLANNING', 'PLANS', 'PLANT',
    'PLANTS', 'PLAYED', 'PLAYER', 'PLAYERS', 'PLAYING', 'PLEASE', 'PLUS',
    'POCKET', 'POEM', 'POETRY', 'POINTS', 'POLICE', 'POLICIES', 'POLICY',
    'POOR', 'POPULAR', 'POPULATION', 'POSITION', 'POSITIVE', 'POTENTIAL',
    'PRACTICE', 'PREPARED', 'PRESENCE', 'PRESS', 'PRESSURE', 'PRETTY', 'PREVENT',
    'PREVIOUS', 'PRICE', 'PRICES', 'PRIMARY', 'PRIME', 'PRINCIPLE', 'PRINCIPLES',
    'PRIVATE', 'PROBABLY', 'PROBLEMS', 'PROCEDURE', 'PROCESS', 'PRODUCE',
    'PRODUCED', 'PRODUCT', 'PRODUCTION', 'PRODUCTS', 'PROFESSIONAL', 'PROFESSOR',
    'PROGRAMS', 'PROGRESS', 'PROJECT', 'PROJECTS', 'PROMISE', 'PROPERTY',
    'PROPOSED', 'PROTECT', 'PROTECTION', 'PROVE', 'PROVIDE', 'PROVIDED', 'PROVIDES',
    'PULL', 'PURPOSE', 'PURPOSES', 'PUSH', 'PUT', 'PUTTING', 'QUALITY', 'QUICKLY',
    'QUIET', 'RACE', 'RADIO', 'RAISE', 'RAISED', 'RAN', 'RANGE', 'RATE', 'RATES',
    'RATHER', 'REACH', 'REACHED', 'REACTION', 'READERS', 'READING', 'READY',
    'REAL', 'REALITY', 'REALIZE', 'REALLY', 'REASONS', 'RECEIVE', 'RECEIVED',
    'RECENT', 'RECENTLY', 'RECORD', 'RECORDS', 'RED', 'REDUCE', 'REDUCED',
    'REFERENCE', 'REFLECT', 'REGARD', 'REGION', 'REGIONAL', 'REGULAR', 'RELATED',
    'RELATIONS', 'RELATIONSHIP', 'RELATIVELY', 'RELEASE', 'RELIGIOUS', 'REMAIN',
    'REMAINED', 'REMAINING', 'REMAINS', 'REMEMBER', 'REMOVED', 'REPORT', 'REPORTED',
    'REPORTS', 'REPRESENT', 'REPRESENTATIVE', 'REPRESENTATIVES', 'REPUBLIC',
    'REPUBLICAN', 'REQUIRE', 'REQUIRED', 'REQUIREMENTS', 'REQUIRES', 'RESEARCH',
    'RESOURCES', 'RESPECT', 'RESPONSE', 'RESPONSIBILITY', 'REST', 'RESULT',
    'RESULTS', 'RETURN', 'RETURNED', 'REVIEW', 'RICH', 'RIGHTS', 'RISE', 'RISING',
    'RISK', 'ROCK', 'ROLE', 'RULES', 'RUN', 'RUNNING', 'SAFETY', 'SALE', 'SALES',
    'SAT', 'SAVE', 'SAW', 'SAY', 'SAYING', 'SAYS', 'SCALE', 'SCENE', 'SCIENCE',
    'SCIENTIFIC', 'SCORE', 'SEA', 'SEARCH', 'SEASON', 'SEAT', 'SECRETARY', 'SECTION',
    'SECURITY', 'SEE', 'SEEING', 'SEEK', 'SEEKING', 'SEEMS', 'SELF', 'SELL',
    'SENATE', 'SENATOR', 'SEND', 'SENIOR', 'SENSE', 'SENT', 'SEPARATE', 'SERIES',
    'SERIOUS', 'SERIOUSLY', 'SERVE', 'SERVED', 'SERVICE', 'SERVICES', 'SET',
    'SETTING', 'SEVEN', 'SEX', 'SEXUAL', 'SHARE', 'SHE', 'SHIP', 'SHOT', 'SHOULDER',
    'SHOWS', 'SHUT', 'SIGNIFICANT', 'SIMILAR', 'SIMPLE', 'SIMPLY', 'SINGLE',
    'SIT', 'SITE', 'SITTING', 'SITUATION', 'SIX', 'SIZE', 'SKILL', 'SKILLS',
    'SKIN', 'SLEEP', 'SLIGHTLY', 'SLOWLY', 'SMILED', 'SNOW', 'SOCIETY', 'SOFT',
    'SOFTWARE', 'SOIL', 'SOLD', 'SOLDIER', 'SOLDIERS', 'SOLUTION', 'SOMEBODY',
    'SOMEONE', 'SON', 'SONG', 'SORT', 'SOUGHT', 'SOUL', 'SOUND', 'SOUNDS',
    'SOURCE', 'SOURCES', 'SOUTHERN', 'SPACE', 'SPEAKING', 'SPECIES', 'SPECIFIC',
    'SPEECH', 'SPEED', 'SPEND', 'SPENDING', 'SPENT', 'SPIRIT', 'SPOKE', 'SPOKEN',
    'SPORT', 'SPORTS', 'SPOT', 'SPREAD', 'SPRING', 'SQUARE', 'STAFF', 'STAGE',
    'STANDARD', 'STANDARDS', 'STANDING', 'STAR', 'STARTED', 'STARTING', 'STATEMENT',
    'STATION', 'STATUS', 'STAY', 'STAYED', 'STEP', 'STEPS', 'STOCK', 'STONE',
    'STOOD', 'STOP', 'STOPPED', 'STORE', 'STORIES', 'STRAIGHT', 'STRANGE',
    'STRATEGIC', 'STRATEGY', 'STRENGTH', 'STRESS', 'STRIKE', 'STRONG', 'STRONGLY',
    'STRUCK', 'STRUCTURE', 'STRUGGLE', 'STUDENT', 'STUDENTS', 'STUDIED', 'STUDIES',
    'STUFF', 'STYLE', 'SUBJECT', 'SUBJECTS', 'SUCCESS', 'SUCCESSFUL', 'SUDDENLY',
    'SUFFER', 'SUGGESTED', 'SUMMER', 'SUN', 'SUPPLY', 'SUPPORT', 'SUPPORTED',
    'SUPPOSE', 'SUPPOSED', 'SURE', 'SURFACE', 'SURPRISE', 'SURPRISED', 'SURVEY',
    'SWEET', 'SYSTEMS', 'TABLE', 'TAKES', 'TAKING', 'TALK', 'TALKED', 'TALKING',
    'TAX', 'TAXES', 'TEACH', 'TEACHER', 'TEACHERS', 'TEACHING', 'TEAM', 'TEAMS',
    'TECHNICAL', 'TECHNOLOGY', 'TEETH', 'TELEPHONE', 'TELEVISION', 'TELLING',
    'TEN', 'TEND', 'TERM', 'TERMS', 'TEST', 'TESTING', 'TESTS', 'TEXT', 'THE',
    'THEATER', 'THEMSELVES', 'THEN', 'THEORY', 'THINKING', 'THIRD', 'THREAT',
    'THROUGHOUT', 'THUS', 'TIED', 'TITLE', 'TODAY', 'TOGETHER', 'TOP', 'TOTAL',
    'TOUCH', 'TOUCHED', 'TOUGH', 'TOUR', 'TOWARD', 'TOWARDS', 'TOWN', 'TRACK',
    'TRADE', 'TRADITIONAL', 'TRAFFIC', 'TRAIN', 'TRAINING', 'TRAVEL', 'TREAT',
    'TREATED', 'TREATMENT', 'TREATY', 'TREE', 'TREES', 'TRIAL', 'TRIED', 'TRIP',
    'TROOPS', 'TROUBLE', 'TRUST', 'TRUTH', 'TRY', 'TRYING', 'TURN', 'TURNING',
    'TURNS', 'TWICE', 'TWO', 'TYPE', 'TYPES', 'TYPICAL', 'UNDERSTAND',
    'UNDERSTANDING', 'UNION', 'UNIT', 'UNITS', 'UNIVERSITY', 'UNLIKE', 'UNLIKELY',
    'US', 'USA', 'USE', 'USEFUL', 'USERS', 'USES', 'USUALLY', 'VALUE', 'VALUES',
    'VARIETY', 'VARIOUS', 'VERSION', 'VIEW', 'VIEWS', 'VILLAGE', 'VIOLENCE',
    'VISION', 'VISIT', 'VOICE', 'VOLUME', 'VOTE', 'VOTES', 'WAIT', 'WAITING',
    'WALK', 'WALKED', 'WALKING', 'WALL', 'WALLS', 'WAR', 'WARM', 'WASHINGTON',
    'WATCHING', 'WAVE', 'WAYS', 'WEAPONS', 'WEAR', 'WEATHER', 'WEEKS', 'WEIGHT',
    'WELCOME', 'WELFARE', 'WEST', 'WESTERN', 'WHATEVER', 'WHEEL', 'WHENEVER',
    'WHEREAS', 'WHETHER', 'WIDE', 'WIDELY', 'WIFE', 'WILD', 'WILLING', 'WIN',
    'WIND', 'WINDOW', 'WINTER', 'WISH', 'WITHIN', 'WON', 'WONDER', 'WONDERFUL',
    'WOOD', 'WORE', 'WORKED', 'WORKER', 'WORKERS', 'WORKING', 'WORRY', 'WORSE',
    'WORST', 'WORTH', 'WRITER', 'WRITERS', 'WRITING', 'WRITTEN', 'WROTE', 'YARD',
    'YEAH', 'YELLOW', 'YES', 'YESTERDAY', 'YET', 'YORK',
    // Additional English words that slipped through
    'COVENANT', 'DUPLEX', 'TOKENISE', 'TOKENIZE', 'SIESTA', 'FUYANT',
    'SPEAKER', 'SPEAKERS', 'MEETING', 'MEETINGS', 'LEADER', 'LEADERS',
    'SCANNER', 'SCANNERS', 'PRINTER', 'PRINTERS', 'BROWSER', 'BROWSERS',
    'FOLDER', 'FOLDERS', 'TRACKER', 'TRACKERS', 'HACKER', 'HACKERS',
    'CLUSTER', 'CLUSTERS', 'BUFFER', 'BUFFERS', 'ROUTER', 'ROUTERS',
    'SERVER', 'SERVERS', 'PLAYER', 'PLAYERS', 'DEALER', 'DEALERS',
    'TRAILER', 'TRAILERS', 'INSIDER', 'INSIDERS', 'OUTSIDER', 'OUTSIDERS',
    'WEATHER', 'FEATHER', 'LEATHER', 'TOGETHER', 'WHETHER', 'NEITHER',
    'EITHER', 'RATHER', 'GATHER', 'FATHER', 'MOTHER', 'BROTHER', 'OTHER',
    'ANOTHER', 'BOTHER', 'SMOTHER', 'FURTHER', 'NORTHERN', 'SOUTHERN',
    'WESTERN', 'EASTERN', 'PATTERN', 'LANTERN', 'CAVERN', 'TAVERN',
    'MODERN', 'CONCERN', 'DISCERN', 'GOVERN', 'RETURN', 'SATURN',
    'BUTTON', 'COTTON', 'MUTTON', 'KITTEN', 'MITTEN', 'BITTEN', 'WRITTEN',
    'ROTTEN', 'FORGOTTEN', 'HIDDEN', 'SUDDEN', 'GARDEN', 'WARDEN', 'BURDEN',
    'GOLDEN', 'MOLTEN', 'LISTEN', 'GLISTEN', 'MOISTEN', 'HASTEN', 'FASTEN',
    'LOOSEN', 'CHOSEN', 'FROZEN', 'BROKEN', 'SPOKEN', 'WOKEN', 'TOKEN',
    'CHICKEN', 'THICKEN', 'QUICKEN', 'SICKEN', 'WEAKEN', 'AWAKEN', 'TAKEN',
    'SHAKEN', 'FORSAKEN', 'MISTAKEN', 'SUNKEN', 'DRUNKEN', 'SHRUNKEN'
  ]);

  words = content.split('\n')
    .map(w => w.trim().toUpperCase())
    .filter(w => w.length >= 6 && w.length <= 10)
    .filter(w => {
      // Filter out words with conjugation endings
      for (const ending of conjugationEndings) {
        if (w.endsWith(ending) && w.length > ending.length + 2) {
          return false;
        }
      }
      // Filter out passé simple using regex patterns
      for (const pattern of passeSimplePatterns) {
        if (pattern.test(w)) {
          return false;
        }
      }
      return true;
    })
    .filter(w => !englishWords.has(w)); // Filter out English words

  console.log(`Loaded ${words.length} words (filtered conjugations & English)`);
  setWordOfTheDay();
}

function setWordOfTheDay() {
  const today = new Date().toDateString();
  const seed = today.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const index = seed % words.length;
  wordOfTheDay = words[index];
  console.log(`Word of the day set (length: ${wordOfTheDay.length})`);
}

function getRandomWord(length = null) {
  const filteredWords = length ? words.filter(w => w.length === length) : words;
  return filteredWords[Math.floor(Math.random() * filteredWords.length)];
}

// ============== TEST MODE - START (EASY TO DELETE) ==============
// Mode de test: si adminPseudo est "admin", utilise des mots fixes
function getTestWords(wordCount) {
  const testWords = ['SALADE', 'TOMATE']; // Mots avec premières lettres différentes pour tester
  const result = [];
  for (let i = 0; i < wordCount; i++) {
    result.push(testWords[i % 2]); // Alterne entre SALADE et TOMATE
  }
  return result;
}
// ============== TEST MODE - END ==============

function checkGuess(word, guess) {
  const result = [];
  const wordArray = word.split('');
  const guessArray = guess.split('');
  const used = new Array(word.length).fill(false);

  for (let i = 0; i < guessArray.length; i++) {
    if (guessArray[i] === wordArray[i]) {
      result.push({ letter: guessArray[i], status: 'correct' });
      used[i] = true;
    } else {
      result.push({ letter: guessArray[i], status: 'absent' });
    }
  }

  for (let i = 0; i < guessArray.length; i++) {
    if (result[i].status === 'absent') {
      for (let j = 0; j < wordArray.length; j++) {
        if (!used[j] && guessArray[i] === wordArray[j]) {
          result[i].status = 'present';
          used[j] = true;
          break;
        }
      }
    }
  }

  return result;
}

function generateSessionId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/word-of-the-day', (req, res) => {
  res.json({
    length: wordOfTheDay.length,
    firstLetter: wordOfTheDay[0]
  });
});

app.get('/api/debug/word-of-the-day', (req, res) => {
  res.json({
    word: wordOfTheDay,
    length: wordOfTheDay.length,
    firstLetter: wordOfTheDay[0]
  });
});

app.post('/api/check-word', (req, res) => {
  const { word, guess } = req.body;
  if (!word || !guess) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  // Determine which word to check against
  let targetWord;
  if (word === 'DAILY') {
    targetWord = wordOfTheDay;
  } else {
    // Check if it's a solo session ID
    const soloSession = soloSessions.get(word);
    if (soloSession) {
      targetWord = soloSession.word;
    } else {
      return res.status(400).json({ error: 'Invalid session' });
    }
  }

  // Tusmo rule: guess must start with the first letter
  if (guess.toUpperCase()[0] !== targetWord[0]) {
    return res.json({ valid: false, message: `Le mot doit commencer par ${targetWord[0]}` });
  }

  const isValid = words.includes(guess.toUpperCase());
  if (!isValid) {
    return res.json({ valid: false, message: 'Mot non trouvé dans le dictionnaire' });
  }

  const result = checkGuess(targetWord.toUpperCase(), guess.toUpperCase());
  res.json({ valid: true, result });
});

app.get('/api/random-word', (req, res) => {
  const length = req.query.length ? parseInt(req.query.length) : null;
  const word = getRandomWord(length);

  // Generate session ID for solo game
  const sessionId = Math.random().toString(36).substring(2, 10).toUpperCase();
  soloSessions.set(sessionId, {
    word: word,
    createdAt: Date.now()
  });

  res.json({
    sessionId: sessionId,
    length: word.length,
    firstLetter: word[0]
  });
});

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('reconnect-to-session', ({ sessionId, pseudo }) => {
    const session = multiplayerSessions.get(sessionId);

    if (!session) {
      socket.emit('reconnect-error', { message: 'Session introuvable ou expirée' });
      return;
    }

    let player = Array.from(session.players.values()).find(p => p.pseudo === pseudo);
    let isNewPlayer = false;

    if (!player) {
      // New player joining an existing session
      isNewPlayer = true;
      session.players.set(socket.id, {
        id: socket.id,
        pseudo,
        scores: [],
        totalScore: 0,
        startTime: session.gameStarted ? Date.now() : null,
        endTime: null,
        completionTime: null,
        currentWordIndex: 0
      });
      player = session.players.get(socket.id);
    } else {
      // Existing player reconnecting - update their socket ID
      const oldId = player.id;
      session.players.delete(oldId);
      player.id = socket.id;
      session.players.set(socket.id, player);
    }

    socket.join(sessionId);

    // Check if this player is the admin (by pseudo since socket ID changes)
    const isAdmin = Array.from(session.players.values())[0]?.pseudo === pseudo;
    if (isAdmin) {
      session.adminId = socket.id;
    }

    const players = Array.from(session.players.values()).map(p => ({
      id: p.id,
      pseudo: p.pseudo,
      totalScore: p.totalScore
    }));

    // Use PLAYER's current word index, not session's
    const playerWordIndex = player.currentWordIndex;
    const currentWord = session.gameStarted && session.words[playerWordIndex] ? {
      length: session.words[playerWordIndex].length,
      firstLetter: session.words[playerWordIndex][0],
      wordNumber: playerWordIndex + 1,
      totalWords: session.words.length
    } : null;

    // Send reconnection data to the player
    socket.emit('reconnected-to-session', {
      sessionId,
      config: session.config,
      players,
      isAdmin,
      gameStarted: session.gameStarted,
      currentWordIndex: playerWordIndex,
      currentWord,
      previousGuesses: player.scores[playerWordIndex]?.guesses || []
    });

    // Notify other players that someone (re)joined
    socket.to(sessionId).emit('player-joined', {
      players,
      newPlayer: { id: socket.id, pseudo }
    });

    console.log(`${pseudo} ${isNewPlayer ? 'joined' : 'reconnected to'} session ${sessionId}`);
  });

  socket.on('create-session', ({ pseudo, wordCount, wordLengthMode }) => {
    const sessionId = generateSessionId();

    const config = {
      wordCount: parseInt(wordCount) || 1,
      wordLengthMode: wordLengthMode || 'random'
    };

    // ============== TEST MODE - START (EASY TO DELETE) ==============
    const words = pseudo === 'admin' ? getTestWords(config.wordCount) : [];

    if (pseudo !== 'admin') {
    // ============== TEST MODE - END ==============
      for (let i = 0; i < config.wordCount; i++) {
        let wordLength = null;

        if (config.wordLengthMode === 'random') {
          wordLength = Math.floor(Math.random() * 5) + 6;
        } else if (config.wordLengthMode === 'progressive') {
          wordLength = 6 + (i % 5);
        } else if (config.wordLengthMode.startsWith('fixed-')) {
          wordLength = parseInt(config.wordLengthMode.split('-')[1]);
        }

        words.push(getRandomWord(wordLength));
      }
    // ============== TEST MODE - START (EASY TO DELETE) ==============
    }
    // ============== TEST MODE - END ==============

    multiplayerSessions.set(sessionId, {
      id: sessionId,
      words: words,
      currentWordIndex: 0,
      config: config,
      adminId: socket.id,
      adminPseudo: pseudo, // ============== TEST MODE (EASY TO DELETE) ==============
      players: new Map([[socket.id, { id: socket.id, pseudo, scores: [], totalScore: 0, startTime: null, endTime: null, completionTime: null, currentWordIndex: 0 }]]),
      gameStarted: false,
      gameStartTime: null,
      createdAt: Date.now()
    });

    socket.join(sessionId);
    socket.emit('session-created', {
      sessionId,
      config,
      isAdmin: true
    });

    console.log(`Session ${sessionId} created by ${pseudo} (admin)`);
  });

  socket.on('join-session', ({ sessionId, pseudo }) => {
    const session = multiplayerSessions.get(sessionId);

    if (!session) {
      socket.emit('error', { message: 'Session not found' });
      return;
    }

    if (session.gameStarted) {
      socket.emit('error', { message: 'Game already started' });
      return;
    }

    session.players.set(socket.id, {
      id: socket.id,
      pseudo,
      scores: [],
      totalScore: 0,
      startTime: null,
      endTime: null,
      completionTime: null,
      currentWordIndex: 0
    });

    socket.join(sessionId);

    const players = Array.from(session.players.values()).map(p => ({
      id: p.id,
      pseudo: p.pseudo,
      totalScore: p.totalScore
    }));

    const isAdmin = socket.id === session.adminId;

    socket.emit('session-joined', {
      sessionId,
      config: session.config,
      players,
      isAdmin
    });

    io.to(sessionId).emit('player-joined', { pseudo, players });
    console.log(`${pseudo} joined session ${sessionId}`);
  });

  socket.on('start-game', ({ sessionId }) => {
    const session = multiplayerSessions.get(sessionId);

    if (!session || socket.id !== session.adminId) {
      return;
    }

    // Generate new words if game was already played
    if (session.gameStarted || session.gameStartTime !== null) {
      // ============== TEST MODE - START (EASY TO DELETE) ==============
      const words = session.adminPseudo === 'admin' ? getTestWords(session.config.wordCount) : [];

      if (session.adminPseudo !== 'admin') {
      // ============== TEST MODE - END ==============
        for (let i = 0; i < session.config.wordCount; i++) {
          let wordLength = null;

          if (session.config.wordLengthMode === 'random') {
            wordLength = Math.floor(Math.random() * 5) + 6;
          } else if (session.config.wordLengthMode === 'progressive') {
            wordLength = 6 + (i % 5);
          } else if (session.config.wordLengthMode.startsWith('fixed-')) {
            wordLength = parseInt(session.config.wordLengthMode.split('-')[1]);
          }

          words.push(getRandomWord(wordLength));
        }
      // ============== TEST MODE - START (EASY TO DELETE) ==============
      }
      // ============== TEST MODE - END ==============
      session.words = words;
    }

    session.gameStarted = true;
    session.currentWordIndex = 0;
    session.gameStartTime = Date.now();

    // Reset and initialize all players
    for (const player of session.players.values()) {
      player.scores = [];
      player.totalScore = 0;
      player.startTime = session.gameStartTime;
      player.endTime = null;
      player.completionTime = null;
      player.currentWordIndex = 0; // Track each player's current word
    }

    const currentWord = session.words[0];

    io.to(sessionId).emit('game-started', {
      wordLength: currentWord.length,
      firstLetter: currentWord[0],
      wordNumber: 1,
      totalWords: session.words.length
    });

    console.log(`Game started in session ${sessionId}`);
  });

  socket.on('typing-update', ({ sessionId, currentInput, wordNumber }) => {
    const session = multiplayerSessions.get(sessionId);
    if (!session || !session.gameStarted) return;

    const player = session.players.get(socket.id);
    if (!player) return;

    // Get word length for current word
    const wordLength = session.words[player.currentWordIndex]?.length || 6;

    // Broadcast to other players
    socket.to(sessionId).emit('player-typing', {
      playerId: socket.id,
      pseudo: player.pseudo,
      currentInput,
      wordNumber: player.currentWordIndex + 1,
      wordLength
    });
  });

  socket.on('submit-guess', ({ sessionId, guess }) => {
    const session = multiplayerSessions.get(sessionId);

    if (!session || !session.gameStarted) {
      return;
    }

    const player = session.players.get(socket.id);
    if (!player) {
      return;
    }

    const guessUpper = guess.toUpperCase();

    // Use player's current word index (each player progresses independently)
    const currentWordIndexBeforeUpdate = player.currentWordIndex; // Save before any updates
    const currentWord = session.words[player.currentWordIndex];

    // Tusmo rule: guess must start with the first letter
    if (guessUpper[0] !== currentWord[0]) {
      socket.emit('invalid-word', { message: `Le mot doit commencer par ${currentWord[0]}` });
      return;
    }

    if (!words.includes(guessUpper)) {
      socket.emit('invalid-word', { message: 'Mot non trouvé dans le dictionnaire' });
      return;
    }
    const result = checkGuess(currentWord, guessUpper);
    const isCorrect = result.every(r => r.status === 'correct');

    if (!player.scores[player.currentWordIndex]) {
      player.scores[player.currentWordIndex] = { guesses: [], attempts: 0, found: false };
    }

    player.scores[player.currentWordIndex].guesses.push({ guess: guessUpper, result });
    player.scores[player.currentWordIndex].attempts++;

    if (isCorrect) {
      player.scores[player.currentWordIndex].found = true;
      const score = Math.max(7 - player.scores[player.currentWordIndex].attempts, 1);
      player.totalScore += score;

      // Notify all players about the word completion
      io.to(sessionId).emit('player-won-word', {
        pseudo: player.pseudo,
        attempts: player.scores[player.currentWordIndex].attempts,
        wordNumber: player.currentWordIndex + 1,
        totalWords: session.words.length,
        totalScore: player.totalScore
      });

      // Check if player finished all words
      const allWordsCompleted = player.scores.filter(s => s && s.found).length === session.words.length;
      if (allWordsCompleted && !player.endTime) {
        player.endTime = Date.now();
        player.completionTime = player.endTime - player.startTime;

        io.to(sessionId).emit('player-finished', {
          pseudo: player.pseudo,
          completionTime: player.completionTime,
          totalScore: player.totalScore
        });

        // Generate current leaderboard
        const leaderboard = Array.from(session.players.values()).map(p => ({
          pseudo: p.pseudo,
          totalScore: p.totalScore,
          completionTime: p.completionTime,
          scores: p.scores.map((s, idx) => ({
            wordNumber: idx + 1,
            attempts: s ? s.attempts : 0,
            found: s ? s.found : false,
            guesses: s ? s.guesses : []
          }))
        })).sort((a, b) => {
          // Time-based ranking: first to finish wins
          // Players who completed rank higher than eliminated players
          if (a.completionTime !== null && b.completionTime === null) return -1;
          if (a.completionTime === null && b.completionTime !== null) return 1;
          if (a.completionTime === null && b.completionTime === null) {
            // Both eliminated - sort by score
            return b.totalScore - a.totalScore;
          }
          // Both completed - sort by time (fastest first)
          return a.completionTime - b.completionTime;
        });

        // Send leaderboard to the player who just finished
        socket.emit('player-completed', { leaderboard });

        // Check if all players finished
        const allPlayersFinished = Array.from(session.players.values()).every(p => p.endTime !== null);
        if (allPlayersFinished) {
          io.to(sessionId).emit('game-completed', { leaderboard });
          console.log(`Game completed in session ${sessionId}`);
        }
      } else if (!allWordsCompleted) {
        // Player has more words to play - advance to next word
        player.currentWordIndex++; // Move to next word

        if (player.currentWordIndex < session.words.length) {
          const nextWord = session.words[player.currentWordIndex];

          // Send next word info to this player
          socket.emit('next-word', {
            wordLength: nextWord.length,
            firstLetter: nextWord[0],
            wordNumber: player.currentWordIndex + 1,
            totalWords: session.words.length,
            totalScore: player.totalScore
          });

          // Notify other players that this player moved to next word
          socket.broadcast.to(sessionId).emit('player-changed-word', {
            playerId: socket.id,
            pseudo: player.pseudo,
            wordNumber: player.currentWordIndex + 1,
            totalWords: session.words.length
          });
        }
      }
    }

    // Check if player failed current word (max attempts reached without finding it)
    const maxAttempts = 6;
    if (!isCorrect && player.scores[player.currentWordIndex].attempts >= maxAttempts && !player.endTime) {
      // Player failed a word - they are eliminated
      player.endTime = Date.now();
      player.completionTime = null; // Keep null to show as eliminated

      io.to(sessionId).emit('player-finished', {
        pseudo: player.pseudo,
        completionTime: null,
        totalScore: player.totalScore,
        eliminated: true
      });

      // Generate current leaderboard
      const leaderboard = Array.from(session.players.values()).map(p => ({
        pseudo: p.pseudo,
        totalScore: p.totalScore,
        completionTime: p.completionTime,
        scores: p.scores.map((s, idx) => ({
          wordNumber: idx + 1,
          attempts: s ? s.attempts : 0,
          found: s ? s.found : false,
          guesses: s ? s.guesses : []
        }))
      })).sort((a, b) => {
        // Time-based ranking: first to finish wins
        if (a.completionTime !== null && b.completionTime === null) return -1;
        if (a.completionTime === null && b.completionTime !== null) return 1;
        if (a.completionTime === null && b.completionTime === null) {
          return b.totalScore - a.totalScore;
        }
        return a.completionTime - b.completionTime;
      });

      // Send leaderboard to the player who just failed
      socket.emit('player-completed', { leaderboard });

      // Check if all players finished
      const allPlayersFinished = Array.from(session.players.values()).every(p => p.endTime !== null);
      if (allPlayersFinished) {
        io.to(sessionId).emit('game-completed', { leaderboard });
        console.log(`Game completed in session ${sessionId}`);
      }
    }

    socket.emit('guess-result', {
      result,
      isCorrect,
      guessNumber: player.scores[currentWordIndexBeforeUpdate]?.attempts || 0,
      wordNumber: currentWordIndexBeforeUpdate + 1 // Use the saved value before increment
    });

    socket.to(sessionId).emit('player-attempt-update', {
      playerId: socket.id,
      pseudo: player.pseudo,
      result: result,
      totalScore: player.totalScore,
      currentWordIndex: player.currentWordIndex
    });

    const playersData = Array.from(session.players.values()).map(p => ({
      id: p.id,
      pseudo: p.pseudo,
      totalScore: p.totalScore,
      currentWordIndex: p.currentWordIndex,
      attempts: p.scores[p.currentWordIndex]?.guesses.map(g => g.result) || []
    }));

    io.to(sessionId).emit('players-update', { playersData });

    if (isCorrect) {
      io.to(sessionId).emit('player-won-word', {
        pseudo: player.pseudo,
        attempts: player.scores[session.currentWordIndex].attempts
      });
    }
  });

  socket.on('replay-session', ({ sessionId }) => {
    const session = multiplayerSessions.get(sessionId);

    if (!session) {
      socket.emit('error', { message: 'Session not found' });
      return;
    }

    // Reset session state
    session.gameStarted = false;
    session.currentWordIndex = 0;
    session.gameStartTime = null;

    // Generate new words with same config
    const words = [];
    for (let i = 0; i < session.config.wordCount; i++) {
      let wordLength = null;

      if (session.config.wordLengthMode === 'random') {
        wordLength = Math.floor(Math.random() * 5) + 6;
      } else if (session.config.wordLengthMode === 'progressive') {
        wordLength = 6 + (i % 5);
      } else if (session.config.wordLengthMode.startsWith('fixed-')) {
        wordLength = parseInt(session.config.wordLengthMode.split('-')[1]);
      }

      words.push(getRandomWord(wordLength));
    }
    session.words = words;

    // Reset all players
    for (const player of session.players.values()) {
      player.scores = [];
      player.totalScore = 0;
      player.startTime = null;
      player.endTime = null;
      player.completionTime = null;
      player.currentWordIndex = 0;
    }

    const players = Array.from(session.players.values()).map(p => ({
      id: p.id,
      pseudo: p.pseudo,
      totalScore: p.totalScore
    }));

    // Notify all players to return to waiting room
    io.to(sessionId).emit('session-reset', {
      sessionId,
      config: session.config,
      players
    });

    console.log(`Session ${sessionId} reset for replay`);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);

    for (const [sessionId, session] of multiplayerSessions.entries()) {
      if (session.players.has(socket.id)) {
        const player = session.players.get(socket.id);
        const wasAdmin = socket.id === session.adminId;
        session.players.delete(socket.id);

        if (session.players.size === 0) {
          multiplayerSessions.delete(sessionId);
          console.log(`Session ${sessionId} deleted (no players)`);
        } else {
          if (wasAdmin) {
            const newAdminId = Array.from(session.players.keys())[0];
            session.adminId = newAdminId;
            io.to(newAdminId).emit('promoted-to-admin');
            console.log(`New admin in session ${sessionId}: ${newAdminId}`);
          }

          const players = Array.from(session.players.values()).map(p => ({
            id: p.id,
            pseudo: p.pseudo,
            totalScore: p.totalScore
          }));
          io.to(sessionId).emit('player-left', {
            pseudo: player.pseudo,
            players
          });
        }
        break;
      }
    }
  });
});

setInterval(() => {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;

  for (const [sessionId, session] of multiplayerSessions.entries()) {
    if (now - session.createdAt > oneHour) {
      multiplayerSessions.delete(sessionId);
      console.log(`Session ${sessionId} expired`);
    }
  }
}, 5 * 60 * 1000);

loadWords();

setInterval(() => {
  const currentWordOfTheDay = wordOfTheDay;
  setWordOfTheDay();
  if (currentWordOfTheDay !== wordOfTheDay) {
    console.log('Word of the day updated');
  }
}, 60 * 60 * 1000);

server.listen(PORT, () => {
  console.log(`Motus game server running on port ${PORT}`);
});
