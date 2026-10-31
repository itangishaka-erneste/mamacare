--
-- PostgreSQL database dump
--

\restrict PRbHbFydSJb6gf9ZdaIYil9LUvsJ63kFJz290YWNSdilnQ1hITVlV1eUuHJlETD

-- Dumped from database version 18.6
-- Dumped by pg_dump version 18.6

-- Started on 2026-10-31 01:52:53

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 2 (class 3079 OID 58251)
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- TOC entry 5182 (class 0 OID 0)
-- Dependencies: 2
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 233 (class 1259 OID 58616)
-- Name: activity_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.activity_log (
    id integer NOT NULL,
    actor_id integer,
    action text NOT NULL,
    target text,
    detail text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.activity_log OWNER TO postgres;

--
-- TOC entry 232 (class 1259 OID 58615)
-- Name: activity_log_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.activity_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.activity_log_id_seq OWNER TO postgres;

--
-- TOC entry 5183 (class 0 OID 0)
-- Dependencies: 232
-- Name: activity_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.activity_log_id_seq OWNED BY public.activity_log.id;


--
-- TOC entry 227 (class 1259 OID 58551)
-- Name: call_requests; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.call_requests (
    id integer NOT NULL,
    user_id integer NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    transcript text,
    CONSTRAINT call_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'contacted'::text, 'done'::text])))
);


ALTER TABLE public.call_requests OWNER TO postgres;

--
-- TOC entry 226 (class 1259 OID 58550)
-- Name: call_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.call_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.call_requests_id_seq OWNER TO postgres;

--
-- TOC entry 5184 (class 0 OID 0)
-- Dependencies: 226
-- Name: call_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.call_requests_id_seq OWNED BY public.call_requests.id;


--
-- TOC entry 234 (class 1259 OID 58642)
-- Name: case_code_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.case_code_seq
    START WITH 1001
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.case_code_seq OWNER TO postgres;

--
-- TOC entry 238 (class 1259 OID 58657)
-- Name: cases; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.cases (
    id integer NOT NULL,
    code text DEFAULT ('MC-'::text || nextval('public.case_code_seq'::regclass)),
    user_id text,
    patient_name text NOT NULL,
    phone text,
    channel text DEFAULT 'website'::text NOT NULL,
    need text DEFAULT 'Health information'::text NOT NULL,
    status text DEFAULT 'new'::text NOT NULL,
    priority text DEFAULT 'normal'::text NOT NULL,
    assigned_to text,
    notes text,
    ai_summary text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.cases OWNER TO postgres;

--
-- TOC entry 237 (class 1259 OID 58656)
-- Name: cases_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.cases_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.cases_id_seq OWNER TO postgres;

--
-- TOC entry 5185 (class 0 OID 0)
-- Dependencies: 237
-- Name: cases_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.cases_id_seq OWNED BY public.cases.id;


--
-- TOC entry 225 (class 1259 OID 58519)
-- Name: doctor_requests; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.doctor_requests (
    id integer NOT NULL,
    user_id integer NOT NULL,
    reason text NOT NULL,
    preferred_date date NOT NULL,
    preferred_time text NOT NULL,
    method text DEFAULT 'Video call'::text NOT NULL,
    notes text,
    status text DEFAULT 'pending'::text NOT NULL,
    admin_note text,
    reviewed_by integer,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT doctor_requests_method_check CHECK ((method = ANY (ARRAY['Video call'::text, 'Phone call'::text]))),
    CONSTRAINT doctor_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'completed'::text])))
);


ALTER TABLE public.doctor_requests OWNER TO postgres;

--
-- TOC entry 224 (class 1259 OID 58518)
-- Name: doctor_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.doctor_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.doctor_requests_id_seq OWNER TO postgres;

--
-- TOC entry 5186 (class 0 OID 0)
-- Dependencies: 224
-- Name: doctor_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.doctor_requests_id_seq OWNED BY public.doctor_requests.id;


--
-- TOC entry 236 (class 1259 OID 58644)
-- Name: facilities; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.facilities (
    id integer NOT NULL,
    name text NOT NULL,
    district text,
    type text DEFAULT 'Health facility'::text,
    phone text,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.facilities OWNER TO postgres;

--
-- TOC entry 235 (class 1259 OID 58643)
-- Name: facilities_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.facilities_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.facilities_id_seq OWNER TO postgres;

--
-- TOC entry 5187 (class 0 OID 0)
-- Dependencies: 235
-- Name: facilities_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.facilities_id_seq OWNED BY public.facilities.id;


--
-- TOC entry 242 (class 1259 OID 58705)
-- Name: followups; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.followups (
    id integer NOT NULL,
    case_id integer NOT NULL,
    due_date date NOT NULL,
    note text,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.followups OWNER TO postgres;

--
-- TOC entry 241 (class 1259 OID 58704)
-- Name: followups_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.followups_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.followups_id_seq OWNER TO postgres;

--
-- TOC entry 5188 (class 0 OID 0)
-- Dependencies: 241
-- Name: followups_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.followups_id_seq OWNED BY public.followups.id;


--
-- TOC entry 231 (class 1259 OID 58593)
-- Name: notifications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notifications (
    id integer NOT NULL,
    user_id integer NOT NULL,
    type text DEFAULT 'info'::text NOT NULL,
    title text NOT NULL,
    body text,
    read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.notifications OWNER TO postgres;

--
-- TOC entry 230 (class 1259 OID 58592)
-- Name: notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.notifications_id_seq OWNER TO postgres;

--
-- TOC entry 5189 (class 0 OID 0)
-- Dependencies: 230
-- Name: notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.notifications_id_seq OWNED BY public.notifications.id;


--
-- TOC entry 223 (class 1259 OID 58493)
-- Name: questions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.questions (
    id integer NOT NULL,
    user_id integer,
    phone text,
    source text DEFAULT 'web'::text NOT NULL,
    body text NOT NULL,
    ai_answer text,
    flagged boolean DEFAULT false NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT questions_source_check CHECK ((source = ANY (ARRAY['web'::text, 'sms'::text]))),
    CONSTRAINT questions_status_check CHECK ((status = ANY (ARRAY['open'::text, 'resolved'::text])))
);


ALTER TABLE public.questions OWNER TO postgres;

--
-- TOC entry 222 (class 1259 OID 58492)
-- Name: questions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.questions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.questions_id_seq OWNER TO postgres;

--
-- TOC entry 5190 (class 0 OID 0)
-- Dependencies: 222
-- Name: questions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.questions_id_seq OWNED BY public.questions.id;


--
-- TOC entry 240 (class 1259 OID 58681)
-- Name: referrals; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.referrals (
    id integer NOT NULL,
    case_id integer NOT NULL,
    facility_id integer,
    reason text,
    status text DEFAULT 'pending'::text NOT NULL,
    created_by text,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.referrals OWNER TO postgres;

--
-- TOC entry 239 (class 1259 OID 58680)
-- Name: referrals_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.referrals_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.referrals_id_seq OWNER TO postgres;

--
-- TOC entry 5191 (class 0 OID 0)
-- Dependencies: 239
-- Name: referrals_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.referrals_id_seq OWNED BY public.referrals.id;


--
-- TOC entry 229 (class 1259 OID 58572)
-- Name: sms_messages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.sms_messages (
    id integer NOT NULL,
    phone text NOT NULL,
    direction text NOT NULL,
    body text NOT NULL,
    user_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sms_messages_direction_check CHECK ((direction = ANY (ARRAY['in'::text, 'out'::text])))
);


ALTER TABLE public.sms_messages OWNER TO postgres;

--
-- TOC entry 228 (class 1259 OID 58571)
-- Name: sms_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.sms_messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.sms_messages_id_seq OWNER TO postgres;

--
-- TOC entry 5192 (class 0 OID 0)
-- Dependencies: 228
-- Name: sms_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.sms_messages_id_seq OWNED BY public.sms_messages.id;


--
-- TOC entry 221 (class 1259 OID 58466)
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id integer NOT NULL,
    name text NOT NULL,
    phone text,
    email text,
    google_id text,
    pin_hash text,
    role text DEFAULT 'user'::text NOT NULL,
    source text DEFAULT 'web'::text NOT NULL,
    language text DEFAULT 'en'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_login timestamp with time zone,
    CONSTRAINT users_role_check CHECK ((role = ANY (ARRAY['user'::text, 'admin'::text]))),
    CONSTRAINT users_source_check CHECK ((source = ANY (ARRAY['web'::text, 'sms'::text, 'google'::text])))
);


ALTER TABLE public.users OWNER TO postgres;

--
-- TOC entry 220 (class 1259 OID 58465)
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_id_seq OWNER TO postgres;

--
-- TOC entry 5193 (class 0 OID 0)
-- Dependencies: 220
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- TOC entry 244 (class 1259 OID 58725)
-- Name: ussd_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ussd_logs (
    id integer NOT NULL,
    session_id text,
    phone text,
    input text,
    response text,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.ussd_logs OWNER TO postgres;

--
-- TOC entry 243 (class 1259 OID 58724)
-- Name: ussd_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.ussd_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.ussd_logs_id_seq OWNER TO postgres;

--
-- TOC entry 5194 (class 0 OID 0)
-- Dependencies: 243
-- Name: ussd_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.ussd_logs_id_seq OWNED BY public.ussd_logs.id;


--
-- TOC entry 4926 (class 2604 OID 58619)
-- Name: activity_log id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activity_log ALTER COLUMN id SET DEFAULT nextval('public.activity_log_id_seq'::regclass);


--
-- TOC entry 4917 (class 2604 OID 58554)
-- Name: call_requests id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.call_requests ALTER COLUMN id SET DEFAULT nextval('public.call_requests_id_seq'::regclass);


--
-- TOC entry 4931 (class 2604 OID 58660)
-- Name: cases id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cases ALTER COLUMN id SET DEFAULT nextval('public.cases_id_seq'::regclass);


--
-- TOC entry 4913 (class 2604 OID 58522)
-- Name: doctor_requests id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.doctor_requests ALTER COLUMN id SET DEFAULT nextval('public.doctor_requests_id_seq'::regclass);


--
-- TOC entry 4928 (class 2604 OID 58647)
-- Name: facilities id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.facilities ALTER COLUMN id SET DEFAULT nextval('public.facilities_id_seq'::regclass);


--
-- TOC entry 4942 (class 2604 OID 58708)
-- Name: followups id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.followups ALTER COLUMN id SET DEFAULT nextval('public.followups_id_seq'::regclass);


--
-- TOC entry 4922 (class 2604 OID 58596)
-- Name: notifications id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications ALTER COLUMN id SET DEFAULT nextval('public.notifications_id_seq'::regclass);


--
-- TOC entry 4908 (class 2604 OID 58496)
-- Name: questions id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.questions ALTER COLUMN id SET DEFAULT nextval('public.questions_id_seq'::regclass);


--
-- TOC entry 4939 (class 2604 OID 58684)
-- Name: referrals id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.referrals ALTER COLUMN id SET DEFAULT nextval('public.referrals_id_seq'::regclass);


--
-- TOC entry 4920 (class 2604 OID 58575)
-- Name: sms_messages id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sms_messages ALTER COLUMN id SET DEFAULT nextval('public.sms_messages_id_seq'::regclass);


--
-- TOC entry 4903 (class 2604 OID 58469)
-- Name: users id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- TOC entry 4945 (class 2604 OID 58728)
-- Name: ussd_logs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ussd_logs ALTER COLUMN id SET DEFAULT nextval('public.ussd_logs_id_seq'::regclass);


--
-- TOC entry 5165 (class 0 OID 58616)
-- Dependencies: 233
-- Data for Name: activity_log; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.activity_log (id, actor_id, action, target, detail, created_at) FROM stdin;
1	2	registered	user:2	web	2026-10-31 01:13:12.791788+02
2	2	profile_updated	user:2	\N	2026-10-31 01:13:53.877498+02
3	1	login	user:1	pin	2026-10-31 01:17:07.578286+02
4	1	sms_sent	+250788888888	\N	2026-10-31 01:18:02.74496+02
5	3	registered	user:3	web	2026-10-31 01:41:15.883402+02
6	3	doctor_requested	doctor_request:1	Breast health concern	2026-10-31 01:41:50.769869+02
7	1	login	user:1	pin	2026-10-31 01:42:38.167317+02
8	\N	case_created	case:MC-1001	phone	2026-10-31 01:44:55.088799+02
9	1	case_added	case:MC-1001	phone	2026-10-31 01:44:55.102121+02
10	\N	case_created	case:MC-1002	community	2026-10-31 01:47:11.926012+02
11	1	case_added	case:MC-1002	community	2026-10-31 01:47:11.942495+02
12	5	registered	user:5	web	2026-10-31 01:49:46.85303+02
13	5	case_created	case:MC-1003	phone	2026-10-31 01:50:28.2886+02
14	5	call_requested	call:1	\N	2026-10-31 01:50:28.296139+02
\.


--
-- TOC entry 5159 (class 0 OID 58551)
-- Dependencies: 227
-- Data for Name: call_requests; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.call_requests (id, user_id, status, created_at, transcript) FROM stdin;
1	5	pending	2026-10-31 01:50:28.253268+02	\N
\.


--
-- TOC entry 5170 (class 0 OID 58657)
-- Dependencies: 238
-- Data for Name: cases; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.cases (id, code, user_id, patient_name, phone, channel, need, status, priority, assigned_to, notes, ai_summary, created_at, updated_at) FROM stdin;
1	MC-1001	\N	louix maxime	+250738383383	phone	Virtual consultation	new	high	\N	adding some nogtes	\N	2026-10-31 01:44:55.054307+02	2026-10-31 01:44:55.054307+02
2	MC-1002	\N	justin	\N	community	Medical referral	new	normal	\N	hhh	\N	2026-10-31 01:47:11.884682+02	2026-10-31 01:47:11.884682+02
3	MC-1003	5	ITANGISHAKA Erneste	+25072335555	phone	Call support	new	normal	\N	\N	\N	2026-10-31 01:50:28.284278+02	2026-10-31 01:50:28.284278+02
\.


--
-- TOC entry 5157 (class 0 OID 58519)
-- Dependencies: 225
-- Data for Name: doctor_requests; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.doctor_requests (id, user_id, reason, preferred_date, preferred_time, method, notes, status, admin_note, reviewed_by, reviewed_at, created_at) FROM stdin;
1	3	Breast health concern	2026-10-31	13:00-14:00	Video call	i'm suffering from this kind of 	pending	\N	\N	\N	2026-10-31 01:41:50.714856+02
\.


--
-- TOC entry 5168 (class 0 OID 58644)
-- Dependencies: 236
-- Data for Name: facilities; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.facilities (id, name, district, type, phone, created_at) FROM stdin;
1	Butaro District Hospital	Burera	District hospital	\N	2026-10-31 01:43:22.990223+02
2	Ruhengeri Referral Hospital	Musanze	Referral hospital	\N	2026-10-31 01:43:22.991219+02
3	CHUK University Teaching Hospital	Nyarugenge, Kigali	Teaching hospital	\N	2026-10-31 01:43:22.991563+02
4	King Faisal Hospital	Gasabo, Kigali	Referral hospital	\N	2026-10-31 01:43:22.991915+02
\.


--
-- TOC entry 5174 (class 0 OID 58705)
-- Dependencies: 242
-- Data for Name: followups; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.followups (id, case_id, due_date, note, status, created_at) FROM stdin;
\.


--
-- TOC entry 5163 (class 0 OID 58593)
-- Dependencies: 231
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.notifications (id, user_id, type, title, body, read, created_at) FROM stdin;
1	2	welcome	Welcome to Mama Care	Your support space is ready. Ask the assistant or request help any time.	f	2026-10-31 01:13:12.784298+02
2	3	welcome	Welcome to Mama Care	Your support space is ready. Ask the assistant or request help any time.	f	2026-10-31 01:41:15.849432+02
3	3	doctor	Meeting request sent	We received your request for 2026-10-31, 13:00-14:00. The care team will confirm.	f	2026-10-31 01:41:50.757372+02
4	1	doctor	New virtual doctor request	Breast health concern: 2026-10-31, 13:00-14:00	f	2026-10-31 01:41:50.766291+02
7	1	call	New support call request	A user is waiting for a call.	f	2026-10-31 01:50:28.294918+02
6	5	call	Support call requested	A Mama Care responder will call you soon.	t	2026-10-31 01:50:28.291816+02
5	5	welcome	Welcome to Mama Care	Your support space is ready. Ask the assistant or request help any time.	t	2026-10-31 01:49:46.845233+02
\.


--
-- TOC entry 5155 (class 0 OID 58493)
-- Dependencies: 223
-- Data for Name: questions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.questions (id, user_id, phone, source, body, ai_answer, flagged, status, created_at) FROM stdin;
1	2	+25078888888	web	hi	Thank you for sharing. It's good that you asked early. Please visit your nearest health center for a check-up, or book a virtual doctor or call Mama Care for support. I cannot diagnose, but a health professional can help you.	f	open	2026-10-31 01:13:25.198046+02
\.


--
-- TOC entry 5172 (class 0 OID 58681)
-- Dependencies: 240
-- Data for Name: referrals; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.referrals (id, case_id, facility_id, reason, status, created_by, created_at) FROM stdin;
\.


--
-- TOC entry 5161 (class 0 OID 58572)
-- Dependencies: 229
-- Data for Name: sms_messages; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.sms_messages (id, phone, direction, body, user_id, created_at) FROM stdin;
1	+250788888888	out	fafdnakfjak;lj	1	2026-10-31 01:18:02.725448+02
\.


--
-- TOC entry 5153 (class 0 OID 58466)
-- Dependencies: 221
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, name, phone, email, google_id, pin_hash, role, source, language, created_at, last_login) FROM stdin;
2	ITANGISHAKA Erneste	+25078888888	\N	\N	$2b$10$FT1iCyx7Fyz03IXvQWtEKeXOBIlxjYMYuJTipUU8ymT2YduQswowG	user	web	en	2026-10-31 01:13:12.780616+02	\N
3	ITANGISHAKA Erneste	+250783838383	\N	\N	$2b$10$0wxLLUQWKZIO2vjAAj3WSea/zxVdBDgFztkzzoh435/T/uH/Bc/JW	user	web	en	2026-10-31 01:41:15.810569+02	\N
1	hello	+250788888888	\N	\N	$2b$10$9HcrMx0eOR3X1fql0w0Mfu6ukCTAGEFd4amBfHQ8TNuwFKCUOeZBe	admin	web	en	2026-10-31 01:13:04.781623+02	2026-10-31 01:42:38.129779+02
5	ITANGISHAKA Erneste	+25072335555	\N	\N	$2b$10$He7krUMwl9d1JKj0ZbzvJOGA5iY2tG6XIgSmJ2368VvqieBBfQ5CW	user	web	en	2026-10-31 01:49:46.829484+02	\N
\.


--
-- TOC entry 5176 (class 0 OID 58725)
-- Dependencies: 244
-- Data for Name: ussd_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.ussd_logs (id, session_id, phone, input, response, created_at) FROM stdin;
\.


--
-- TOC entry 5195 (class 0 OID 0)
-- Dependencies: 232
-- Name: activity_log_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.activity_log_id_seq', 14, true);


--
-- TOC entry 5196 (class 0 OID 0)
-- Dependencies: 226
-- Name: call_requests_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.call_requests_id_seq', 1, true);


--
-- TOC entry 5197 (class 0 OID 0)
-- Dependencies: 234
-- Name: case_code_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.case_code_seq', 1003, true);


--
-- TOC entry 5198 (class 0 OID 0)
-- Dependencies: 237
-- Name: cases_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.cases_id_seq', 3, true);


--
-- TOC entry 5199 (class 0 OID 0)
-- Dependencies: 224
-- Name: doctor_requests_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.doctor_requests_id_seq', 1, true);


--
-- TOC entry 5200 (class 0 OID 0)
-- Dependencies: 235
-- Name: facilities_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.facilities_id_seq', 4, true);


--
-- TOC entry 5201 (class 0 OID 0)
-- Dependencies: 241
-- Name: followups_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.followups_id_seq', 1, false);


--
-- TOC entry 5202 (class 0 OID 0)
-- Dependencies: 230
-- Name: notifications_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.notifications_id_seq', 7, true);


--
-- TOC entry 5203 (class 0 OID 0)
-- Dependencies: 222
-- Name: questions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.questions_id_seq', 1, true);


--
-- TOC entry 5204 (class 0 OID 0)
-- Dependencies: 239
-- Name: referrals_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.referrals_id_seq', 1, false);


--
-- TOC entry 5205 (class 0 OID 0)
-- Dependencies: 228
-- Name: sms_messages_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.sms_messages_id_seq', 1, true);


--
-- TOC entry 5206 (class 0 OID 0)
-- Dependencies: 220
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.users_id_seq', 5, true);


--
-- TOC entry 5207 (class 0 OID 0)
-- Dependencies: 243
-- Name: ussd_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.ussd_logs_id_seq', 1, false);


--
-- TOC entry 4981 (class 2606 OID 58627)
-- Name: activity_log activity_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activity_log
    ADD CONSTRAINT activity_log_pkey PRIMARY KEY (id);


--
-- TOC entry 4972 (class 2606 OID 58565)
-- Name: call_requests call_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.call_requests
    ADD CONSTRAINT call_requests_pkey PRIMARY KEY (id);


--
-- TOC entry 4986 (class 2606 OID 58679)
-- Name: cases cases_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cases
    ADD CONSTRAINT cases_code_key UNIQUE (code);


--
-- TOC entry 4988 (class 2606 OID 58677)
-- Name: cases cases_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cases
    ADD CONSTRAINT cases_pkey PRIMARY KEY (id);


--
-- TOC entry 4968 (class 2606 OID 58539)
-- Name: doctor_requests doctor_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.doctor_requests
    ADD CONSTRAINT doctor_requests_pkey PRIMARY KEY (id);


--
-- TOC entry 4984 (class 2606 OID 58655)
-- Name: facilities facilities_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.facilities
    ADD CONSTRAINT facilities_pkey PRIMARY KEY (id);


--
-- TOC entry 4992 (class 2606 OID 58718)
-- Name: followups followups_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.followups
    ADD CONSTRAINT followups_pkey PRIMARY KEY (id);


--
-- TOC entry 4979 (class 2606 OID 58609)
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- TOC entry 4966 (class 2606 OID 58512)
-- Name: questions questions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.questions
    ADD CONSTRAINT questions_pkey PRIMARY KEY (id);


--
-- TOC entry 4990 (class 2606 OID 58693)
-- Name: referrals referrals_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT referrals_pkey PRIMARY KEY (id);


--
-- TOC entry 4976 (class 2606 OID 58586)
-- Name: sms_messages sms_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sms_messages
    ADD CONSTRAINT sms_messages_pkey PRIMARY KEY (id);


--
-- TOC entry 4956 (class 2606 OID 58489)
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- TOC entry 4958 (class 2606 OID 58491)
-- Name: users users_google_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_google_id_key UNIQUE (google_id);


--
-- TOC entry 4960 (class 2606 OID 58487)
-- Name: users users_phone_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_phone_key UNIQUE (phone);


--
-- TOC entry 4962 (class 2606 OID 58485)
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- TOC entry 4994 (class 2606 OID 58734)
-- Name: ussd_logs ussd_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ussd_logs
    ADD CONSTRAINT ussd_logs_pkey PRIMARY KEY (id);


--
-- TOC entry 4982 (class 1259 OID 58640)
-- Name: idx_activity_time; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_activity_time ON public.activity_log USING btree (created_at DESC);


--
-- TOC entry 4973 (class 1259 OID 58637)
-- Name: idx_calls_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_calls_status ON public.call_requests USING btree (status);


--
-- TOC entry 4969 (class 1259 OID 58635)
-- Name: idx_doctor_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_doctor_status ON public.doctor_requests USING btree (status);


--
-- TOC entry 4970 (class 1259 OID 58636)
-- Name: idx_doctor_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_doctor_user ON public.doctor_requests USING btree (user_id);


--
-- TOC entry 4977 (class 1259 OID 58639)
-- Name: idx_notes_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notes_user ON public.notifications USING btree (user_id, read, created_at DESC);


--
-- TOC entry 4963 (class 1259 OID 58633)
-- Name: idx_questions_flagged; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_questions_flagged ON public.questions USING btree (flagged, status);


--
-- TOC entry 4964 (class 1259 OID 58634)
-- Name: idx_questions_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_questions_user ON public.questions USING btree (user_id);


--
-- TOC entry 4974 (class 1259 OID 58638)
-- Name: idx_sms_phone; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_sms_phone ON public.sms_messages USING btree (phone, created_at DESC);


--
-- TOC entry 5001 (class 2606 OID 58628)
-- Name: activity_log activity_log_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activity_log
    ADD CONSTRAINT activity_log_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- TOC entry 4998 (class 2606 OID 58566)
-- Name: call_requests call_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.call_requests
    ADD CONSTRAINT call_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 4996 (class 2606 OID 58545)
-- Name: doctor_requests doctor_requests_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.doctor_requests
    ADD CONSTRAINT doctor_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- TOC entry 4997 (class 2606 OID 58540)
-- Name: doctor_requests doctor_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.doctor_requests
    ADD CONSTRAINT doctor_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 5004 (class 2606 OID 58719)
-- Name: followups followups_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.followups
    ADD CONSTRAINT followups_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE CASCADE;


--
-- TOC entry 5000 (class 2606 OID 58610)
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 4995 (class 2606 OID 58513)
-- Name: questions questions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.questions
    ADD CONSTRAINT questions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- TOC entry 5002 (class 2606 OID 58694)
-- Name: referrals referrals_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT referrals_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE CASCADE;


--
-- TOC entry 5003 (class 2606 OID 58699)
-- Name: referrals referrals_facility_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT referrals_facility_id_fkey FOREIGN KEY (facility_id) REFERENCES public.facilities(id) ON DELETE SET NULL;


--
-- TOC entry 4999 (class 2606 OID 58587)
-- Name: sms_messages sms_messages_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sms_messages
    ADD CONSTRAINT sms_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


-- Completed on 2026-10-31 01:52:53

--
-- PostgreSQL database dump complete
--

\unrestrict PRbHbFydSJb6gf9ZdaIYil9LUvsJ63kFJz290YWNSdilnQ1hITVlV1eUuHJlETD

