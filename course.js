// ===== COURSE DATA =====
const defaultCourseImage = 'img-450a5b8d.jpg';
const courseData = {
  business: {
    icon: '🗣️', tag: "Diploma · 1 Year",
    title: 'English Language',
    desc: 'Build strong English communication skills from the basics through advanced grammar, preparing you for academic and professional success.',
    meta: ['⏱ 1 Year', '📖 Full-time', '🏛 On-Campus', '🎓 Diploma'],
    gradient: 'linear-gradient(135deg, #1c1645, #282058)',
    overviewTitle: 'Master the <span>English Language</span>',
    overviewText: 'The English Language Diploma at KIC takes students from the fundamentals of the language through to advanced grammar and fluency. Across four progressive levels, students build vocabulary, reading, writing, and speaking skills, with a strong focus on grammar and tenses needed for academic and professional communication.',
    highlights: ['Grammar Foundations', 'Tenses', 'Active & Passive Voice', 'Reading & Writing', 'Speaking & Listening', 'Vocabulary Building'],
    stats: [
      { label: 'Duration', value: '1 Year' },
      { label: 'Mode', value: 'Full-time, On-campus' },
      { label: 'Degree Awarded', value: "Diploma in English Language" },
      { label: 'Language', value: 'English / Somali' },
      { label: 'Intake', value: 'September & February' },
    ],
    years: [
      { title: 'Basic – Foundations of English', desc: 'Getting started with the basics of the language', color: '#1c1645',
        subjects: [
          { icon: '📘', name: 'Basic English Book', desc: 'Foundational vocabulary, spelling, and simple sentence structure.', credits: '' },
        ]},
      { title: 'Beginner – Building Fluency', desc: 'Growing vocabulary and understanding tenses', color: '#282058',
        subjects: [
          { icon: '📗', name: 'Beginner English Book', desc: 'Everyday vocabulary, reading, and conversational practice.', credits: '' },
          { icon: '⏳', name: 'Twelve Tenses', desc: 'Mastering the twelve English tenses and their correct usage.', credits: '' },
          { icon: '🔄', name: 'Passive Voice and Active Voice', desc: 'Understanding and forming active and passive sentence structures.', credits: '' },
        ]},
      { title: 'Intermediate – Grammar Mastery', desc: 'Strengthening grammar and written expression', color: '#007a00',
        subjects: [
          { icon: '📙', name: 'Intermediate English Book', desc: 'Expanded vocabulary, comprehension, and writing skills.', credits: '' },
          { icon: '📝', name: 'Grammar One', desc: 'Core grammar rules, sentence structure, and common errors.', credits: '' },
          { icon: '📝', name: 'Grammar Two', desc: 'Advanced sentence patterns and grammatical accuracy.', credits: '' },
        ]},
      { title: 'Advanced – Fluency & Grammar', desc: 'Refining fluency and advanced grammar skills', color: '#3b3384',
        subjects: [
          { icon: '📕', name: 'Advanced English Book', desc: 'Advanced reading, writing, and academic English skills.', credits: '' },
          { icon: '📝', name: 'Grammar Three', desc: 'Complex grammar structures and professional writing.', credits: '' },
          { icon: '📝', name: 'Grammar Four', desc: 'Mastery-level grammar for academic and professional fluency.', credits: '' },
        ]},
    ],
    careers: [
      { icon: '🎓', title: 'English Teacher', org: 'Schools & Language Centers' },
      { icon: '📚', title: 'Academic Translator', org: 'NGOs & Institutions' },
      { icon: '🗣️', title: 'Interpreter', org: 'Government & Agencies' },
      { icon: '✍️', title: 'Content Writer', org: 'Media & Publishing' },
      { icon: '📞', title: 'Customer Service Rep', org: 'International Firms' },
      { icon: '🎓', title: 'Further Studies', org: 'Bachelor\'s Programs' },
    ],
  },
  cs: {
    icon: '💻', tag: "Diploma · 1 Year",
    title: 'Computer Science',
    desc: 'Learn essential computer skills from the basics through Microsoft Office, graphic design, video editing, and web development.',
    meta: ['⏱ 1 Year', '💻 Lab-Intensive', '🏛 On-Campus', '🎓 Diploma'],
    gradient: 'linear-gradient(135deg, #1c1645, #282058)',
    overviewTitle: 'Build Your <span>Digital Skills</span>',
    overviewText: 'The Computer Science Diploma at KIC takes students from the basics of computers through practical, job-ready skills in Microsoft Office, graphic design, video editing, and web development. Students get hands-on lab time with real software, building a strong foundation for further study or immediate employment.',
    highlights: ['Computer Basics', 'Microsoft Office', 'Graphic Design', 'Video Editing', 'Web Development', 'Databases & APIs'],
    stats: [
      { label: 'Duration', value: '1 Year' },
      { label: 'Mode', value: 'Full-time, Lab-based' },
      { label: 'Degree Awarded', value: "Diploma in Computer Science" },
      { label: 'Language', value: 'English' },
      { label: 'Intake', value: 'September & February' },
    ],
    years: [
      { title: 'Basic – Computer Foundations', desc: 'Getting started with computers', color: '#1c1645',
        subjects: [
          { icon: '🖥️', name: 'History of Computer', desc: 'The evolution of computers and computing technology.', credits: '' },
          { icon: '🪟', name: 'Windows', desc: 'Operating system basics, file management, and system settings.', credits: '' },
        ]},
      { title: 'Beginner – Microsoft Office Suite', desc: 'Mastering everyday office software', color: '#282058',
        subjects: [
          { icon: '📝', name: 'Word', desc: 'Document creation, formatting, and professional writing tools.', credits: '' },
          { icon: '📊', name: 'PowerPoint', desc: 'Building presentations, slides, and visual storytelling.', credits: '' },
          { icon: '📈', name: 'Excel', desc: 'Spreadsheets, formulas, and data analysis.', credits: '' },
          { icon: '🗄️', name: 'Access', desc: 'Database basics and building simple data management tools.', credits: '' },
          { icon: '📰', name: 'Publisher', desc: 'Designing flyers, brochures, and printed materials.', credits: '' },
        ]},
      { title: 'Intermediate – Graphic Design & Video Editing', desc: 'Creative software and visual media', color: '#0a5a0a',
        subjects: [
          { icon: '🎨', name: 'Adobe Photoshop', desc: 'Photo editing, retouching, and digital design.', credits: '' },
          { icon: '✏️', name: 'Adobe Illustrator', desc: 'Vector graphics, logos, and illustration design.', credits: '' },
          { icon: '🎬', name: 'Adobe Premiere Pro', desc: 'Video editing, transitions, and post-production.', credits: '' },
        ]},
      { title: 'Advanced – Web Development', desc: 'Building and deploying real websites', color: '#007a00',
        subjects: [
          { icon: '🌐', name: 'Frontend: HTML, CSS & JavaScript', desc: 'Building responsive, interactive websites from scratch.', credits: '' },
          { icon: '🗄️', name: 'Backend & Database: MySQL, Node.js & APIs', desc: 'Server-side logic, databases, and building APIs.', credits: '' },
          { icon: '🚀', name: 'Hosting and Deployment', desc: 'Publishing websites live and managing web hosting.', credits: '' },
        ]},
    ],
    careers: [
      { icon: '🖥️', title: 'IT Support Technician', org: 'Companies & Institutions' },
      { icon: '📊', title: 'Office Administrator', org: 'NGOs & Government' },
      { icon: '🎨', title: 'Graphic Designer', org: 'Media & Marketing' },
      { icon: '🎬', title: 'Video Editor', org: 'Media & Content Studios' },
      { icon: '🌐', title: 'Web Developer', org: 'Agencies & Startups' },
      { icon: '🎓', title: 'Further Studies', org: 'Bachelor\'s Programs' },
    ],
  },
  law: {
    icon: '💉', tag: "Diploma · 1 Year",
    title: 'Health Science',
    desc: 'Gain hands-on clinical and theoretical training in patient care, anatomy, pharmacology, and community health.',
    meta: ['⏱ 1 Year', '📖 Full-time', '🏛 On-Campus', '🎓 Diploma'],
    gradient: 'linear-gradient(135deg, #1c1645, #282058)',
    overviewTitle: 'Build a Career in <span>Health Science</span>',
    overviewText: 'The Health Science Diploma at KIC prepares students to provide safe, competent patient care. Across four terms, students build a foundation in basic health and first aid, move through anatomy, physiology and pharmacology, study specialized areas like ENT, dermatology and parasitology, and finish with essential nutrition knowledge — combining classroom learning with practical clinical skills.',
    highlights: ['First Aid', 'Anatomy & Physiology', 'Pharmacology', 'Disease Control', 'Dermatology', 'Nutrition'],
    stats: [
      { label: 'Duration', value: '1 Year' },
      { label: 'Mode', value: 'Full-time, On-campus' },
      { label: 'Degree Awarded', value: "Diploma in Health Science" },
      { label: 'Language', value: 'English / Somali' },
      { label: 'Intake', value: 'September' },
    ],
    years: [
      { title: 'Term 1 – Basic Health Foundations', desc: 'Introduction to health, first aid, disease control, and immunization', color: '#1c1645',
        subjects: [
          { icon: '🩺', name: 'Basic Health', desc: 'Foundational concepts of human health and patient care.', credits: '' },
          { icon: '🚑', name: 'First Aid', desc: 'Emergency response, wound care, and life-saving techniques.', credits: '' },
          { icon: '🦠', name: 'CDC (Communicable Disease Control)', desc: 'Prevention, control, and management of communicable diseases.', credits: '' },
          { icon: '❤️‍🩹', name: 'Noncommunicable Disease', desc: 'Prevention, management, and care for conditions like diabetes and hypertension.', credits: '' },
          { icon: '💉', name: 'Immunization', desc: 'Vaccination schedules, cold chain management, and immunization programs.', credits: '' },
        ]},
      { title: 'Term 2 – Body Systems & Medicine', desc: 'Anatomy, pharmacology, and medical terminology', color: '#3b3384',
        subjects: [
          { icon: '🫀', name: 'Anatomy and Physiology', desc: 'Structure and function of the human body and its systems.', credits: '' },
          { icon: '💊', name: 'Pharmacology', desc: 'Drug classifications, dosages, and safe medication administration.', credits: '' },
          { icon: '📖', name: 'Medical Terminology', desc: 'Understanding and using clinical and medical vocabulary.', credits: '' },
        ]},
      { title: 'Term 3 – Specialized Care Areas', desc: 'ENT, dermatology, and parasitology', color: '#007a00',
        subjects: [
          { icon: '👂', name: 'ENT (Ear, Nose & Throat)', desc: 'Common conditions and care of the ear, nose, and throat.', credits: '' },
          { icon: '🧴', name: 'Dermatology', desc: 'Skin conditions, diagnosis basics, and patient care.', credits: '' },
          { icon: '🔬', name: 'Parasitology', desc: 'Parasitic infections, transmission, and prevention.', credits: '' },
        ]},
      { title: 'Term 4 – Nutrition & Community Health', desc: 'Nutrition and malnutrition care', color: '#007a00',
        subjects: [
          { icon: '🥗', name: 'Nutrition', desc: 'Principles of healthy diet and nutritional care for patients.', credits: '' },
          { icon: '⚕️', name: 'Malnutrition', desc: 'Identifying, treating, and preventing malnutrition in communities.', credits: '' },
        ]},
    ],
    careers: [
      { icon: '💉', title: 'General Nurse', org: 'Hospitals & Clinics' },
      { icon: '🚑', title: 'Emergency Care Nurse', org: 'Health Centers' },
      { icon: '🏥', title: 'Community Health Nurse', org: 'NGOs & Health Programs' },
      { icon: '🩺', title: 'Clinical Assistant', org: 'Medical Facilities' },
      { icon: '🥗', title: 'Nutrition Care Worker', org: 'Health & Community Programs' },
      { icon: '🎓', title: 'Further Studies', org: 'Bachelor\'s Programs' },
    ],
  },
  health: {
    icon: '🤰', tag: "Diploma · 1 Year",
    title: 'Midwifery',
    desc: 'Gain the clinical and reproductive health expertise to care for mothers and newborns through every stage of the childbearing journey.',
    meta: ['⏱ 1 Year', '🔬 Lab & Field', '🏛 On-Campus', '🎓 Diploma'],
    gradient: 'linear-gradient(135deg, #1c1645, #282058)',
    overviewTitle: 'Build a <span>Healthier Somalia</span>',
    overviewText: 'The Diploma in Midwifery at KIC prepares students to provide safe, skilled care for women through pregnancy, childbirth, and postpartum recovery. Through anatomy, obstetrics, pharmacology, and clinical practice, graduates become frontline maternal health leaders equipped to work in hospitals, health centers, and community health systems across Somalia.',
    highlights: ['Anatomy & Physiology', 'Obstetrics', 'Pharmacology', 'Maternal Health', 'Newborn Care', 'Clinical Practice'],
    stats: [
      { label: 'Duration', value: '1 Year' },
      { label: 'Mode', value: 'Full-time, Lab & Field' },
      { label: 'Degree Awarded', value: "Diploma in Midwifery" },
      { label: 'Language', value: 'English / Somali' },
      { label: 'Intake', value: 'September' },
    ],
    years: [
      { title: 'Phase 1 – Foundational Biopsychosocial Sciences', desc: 'The biological and social sciences behind reproductive health', color: '#0a5a0a',
        subjects: [
          { icon: '🧬', name: 'Anatomy and Physiology of Reproduction', credits: '' },
          { icon: '🩺', name: 'Pathophysiology in Obstetrics', credits: '' },
          { icon: '💊', name: 'Pharmacology for Midwifery', credits: '' },
          { icon: '📊', name: 'Epidemiology', credits: '' },
        ]},
      { title: 'Phase 2 – The Core Clinical Continuums', desc: 'Core clinical competencies through the childbearing cycle', color: '#0b6e0b',
        subjects: [
          { icon: '🤰', name: 'Antepartum Care (Prenatal Care)', credits: '' },
          { icon: '👶', name: 'Intrapartum Care (Labor and Birth)', credits: '' },
          { icon: '🤱', name: 'Postpartum Care (The Puerperium)', credits: '' },
          { icon: '🍼', name: 'Newborn Care (Neonatology)', credits: '' },
        ]},
      { title: 'Phase 3 – Well-Woman Gynecology & Primary Care', desc: 'Full-scope reproductive health care beyond pregnancy', color: '#007a00',
        subjects: [
          { icon: '🩺', name: 'Well-Woman Gynecology', credits: '' },
          { icon: '💊', name: 'Primary Care for Women', credits: '' },
          { icon: '🌸', name: 'Perimenopause and Menopause', credits: '' },
        ]},
      { title: 'Phase 4 – Professional Frameworks & Practice Synthesis', desc: 'Preparing for licensure, legal practice, and clinical decision-making', color: '#007a00',
        subjects: [
          { icon: '⚖️', name: 'Midwifery Jurisprudence and Ethics', credits: '' },
          { icon: '🔬', name: 'Research and Evidence-Based Practice', credits: '' },
          { icon: '🏥', name: 'Advanced Clinical Practicum (The Catch Course)', credits: '' },
        ]},
    ],
    careers: [
      { icon: '🏥', title: 'Midwife', org: 'Hospitals & Health Centers' },
      { icon: '🤱', title: 'MCH Specialist', org: 'Hospitals & Clinics' },
      { icon: '🌍', title: 'Health Program Officer', org: 'WHO, UNICEF, NGOs' },
      { icon: '🏘️', title: 'Community Health Worker', org: 'Local Health Systems' },
      { icon: '🥗', title: 'Nutrition Care Worker', org: 'Health & Community Programs' },
      { icon: '🎓', title: 'Further Studies', org: "Bachelor's Programs" },
    ],
  },
  economics: {
    icon: '🔬', tag: "Diploma · 1 Year",
    title: 'Scientific Subjects',
    desc: 'Build a strong foundation in Biology, Chemistry, Physics, and Math for further studies.',
    meta: ['⏱ 1 Year', '🔬 Lab-Based', '🏛 On-Campus', '🎓 Diploma'],
    gradient: 'linear-gradient(135deg, #1c1645, #282058)',
    overviewTitle: 'Build a Strong <span>Scientific Foundation</span>',
    overviewText: 'The Scientific Subjects Diploma at KIC covers the four core sciences — Biology, Chemistry, Physics, and Math — giving students the foundation they need for health, engineering, and further scientific studies. Each subject combines classroom theory with hands-on lab work.',
    highlights: ['Biology', 'Chemistry', 'Physics', 'Math', 'Lab Skills', 'Scientific Method'],
    stats: [
      { label: 'Duration', value: '1 Year' },
      { label: 'Mode', value: 'Full-time, Lab-based' },
      { label: 'Degree Awarded', value: "Diploma in Scientific Subjects" },
      { label: 'Language', value: 'English' },
      { label: 'Intake', value: 'September & February' },
    ],
    years: [
      { title: 'Biology', desc: 'The study of living organisms', color: '#007a00',
        subjects: [
          { icon: '🧫', name: 'Cell Biology', credits: '' },
          { icon: '🧬', name: 'Genetics', credits: '' },
          { icon: '🦴', name: 'Human Anatomy & Physiology', credits: '' },
          { icon: '🌿', name: 'Botany', credits: '' },
          { icon: '🐾', name: 'Zoology', credits: '' },
          { icon: '🌍', name: 'Ecology', credits: '' },
        ]},
      { title: 'Chemistry', desc: 'The study of matter and its reactions', color: '#008f00',
        subjects: [
          { icon: '⚛️', name: 'Atomic Structure', credits: '' },
          { icon: '🧪', name: 'Chemical Bonding', credits: '' },
          { icon: '🌡️', name: 'Organic Chemistry', credits: '' },
          { icon: '🔥', name: 'Inorganic Chemistry', credits: '' },
          { icon: '⚗️', name: 'Lab Techniques', credits: '' },
        ]},
      { title: 'Physics', desc: 'The study of matter, energy, and motion', color: '#0a5a0a',
        subjects: [
          { icon: '🏃', name: 'Mechanics', credits: '' },
          { icon: '⚡', name: 'Electricity & Magnetism', credits: '' },
          { icon: '🌊', name: 'Waves & Sound', credits: '' },
          { icon: '💡', name: 'Optics', credits: '' },
          { icon: '🔥', name: 'Thermodynamics', credits: '' },
        ]},
      { title: 'Math', desc: 'The study of numbers, patterns, and structure', color: '#007a00',
        subjects: [
          { icon: '➗', name: 'Algebra', credits: '' },
          { icon: '📐', name: 'Geometry', credits: '' },
          { icon: '📈', name: 'Calculus', credits: '' },
          { icon: '📊', name: 'Statistics', credits: '' },
          { icon: '🔢', name: 'Trigonometry', credits: '' },
        ]},
    ],
    careers: [
      { icon: '🔬', title: 'Lab Technician', org: 'Hospitals & Research Labs' },
      { icon: '🧑‍🏫', title: 'Science Teacher', org: 'Schools' },
      { icon: '💊', title: 'Pharmacy Assistant', org: 'Pharmacies & Clinics' },
      { icon: '🌱', title: 'Agricultural Technician', org: 'Farms & Agencies' },
      { icon: '🎓', title: 'Further Studies', org: 'Health Science & Engineering Programs' },
    ],
  },
  ir: {
    icon: '💡', tag: "Diploma · 1 Year",
    title: 'Personal Development',
    desc: 'Build the personal growth and self-improvement skills to lead, adapt, and thrive in any setting.',
    meta: ['⏱ 1 Year', '📖 Part-time', '🏛 On-Campus', '🎓 Diploma'],
    gradient: 'linear-gradient(135deg, #1c1645, #282058)',
    overviewTitle: 'Grow Into Your <span>Best Self</span>',
    overviewText: 'The Personal Development Diploma at KIC builds the core and advanced skills every person needs to grow, lead, and adapt — from communication and emotional intelligence to leadership and resilience. Students leave equipped for any workplace or life challenge.',
    highlights: ['Communication', 'Emotional Intelligence', 'Leadership', 'Resilience', 'Critical Thinking', 'Goal Setting'],
    stats: [
      { label: 'Duration', value: '1 Year' },
      { label: 'Mode', value: 'Part-time, On-campus' },
      { label: 'Degree Awarded', value: "Diploma in Personal Development" },
      { label: 'Language', value: 'English / Somali' },
      { label: 'Intake', value: 'September' },
    ],
    years: [
      { title: 'Phase 1 – Core Personal Growth Skills I', desc: 'Building the essentials', color: '#007a00',
        subjects: [
          { icon: '🗣️', name: 'Communication', credits: '' },
          { icon: '🎤', name: 'Public Speaking', credits: '' },
          { icon: '❤️', name: 'Emotional Intelligence', credits: '' },
        ]},
      { title: 'Phase 2 – Core Personal Growth Skills II', desc: 'Managing yourself and challenges', color: '#008a00',
        subjects: [
          { icon: '⏰', name: 'Time Management', credits: '' },
          { icon: '🔄', name: 'Adaptability', credits: '' },
          { icon: '🧩', name: 'Problem-Solving', credits: '' },
        ]},
      { title: 'Phase 3 – Advanced Self-Improvement Skills I', desc: 'Knowing and guiding yourself and others', color: '#007a00',
        subjects: [
          { icon: '🪞', name: 'Self-Awareness', credits: '' },
          { icon: '👑', name: 'Leadership', credits: '' },
        ]},
      { title: 'Phase 4 – Advanced Self-Improvement Skills II', desc: 'Thinking clearly and moving forward', color: '#1c1645',
        subjects: [
          { icon: '💪', name: 'Resilience', credits: '' },
          { icon: '🧠', name: 'Critical Thinking', credits: '' },
          { icon: '🎯', name: 'Goal Setting', credits: '' },
        ]},
    ],
    careers: [
      { icon: '👑', title: 'Team Leader / Supervisor', org: 'Any Organization' },
      { icon: '🗣️', title: 'Trainer / Facilitator', org: 'NGOs & Institutions' },
      { icon: '🤝', title: 'HR & People Officer', org: 'Companies & Agencies' },
      { icon: '🎯', title: 'Career Coach', org: 'Community Programs' },
      { icon: '🎓', title: 'Further Studies', org: 'Any Bachelor\'s Program' },
    ],
  },
};

// ===== OPEN / CLOSE (redesigned course page) =====
function kcEsc(s) { return String(s == null ? '' : s); }

function openCourse(courseKey) {
  const data = courseData[courseKey];
  if (!data) return;

  document.getElementById('cpTopbarTitle').textContent = data.title;
  document.getElementById('kcDockTitle').textContent = data.title;

  // Hero
  const heroPhoto = document.getElementById('cpHeroPhoto');
  const heroImg = document.getElementById('cpHeroImg');
  if (data.image) { heroImg.src = data.image; heroPhoto.style.display = 'block'; }
  else { heroImg.removeAttribute('src'); heroPhoto.style.display = 'none'; }
  document.getElementById('cpHeroIcon').textContent = data.icon;
  document.getElementById('cpHeroTag').textContent = data.tag;
  document.getElementById('cpHeroTitle').textContent = data.title;
  document.getElementById('cpHeroDesc').textContent = data.desc;
  document.getElementById('cpHeroMeta').innerHTML = data.meta.map(m => `<span>${m}</span>`).join('');

  // Fact strip
  document.getElementById('cpStats').innerHTML = data.stats.map(s => `
    <div class="kc-fact"><small>${s.label}</small><strong>${s.value}</strong></div>`).join('');

  // Overview
  document.getElementById('cpOverviewTitle').innerHTML = data.overviewTitle;
  document.getElementById('cpOverviewText').textContent = data.overviewText;
  document.getElementById('cpHighlights').innerHTML = data.highlights.map(h => `<li>${h}</li>`).join('');

  // Curriculum timeline
  const totalSubjects = data.years.reduce((n, y) => n + y.subjects.length, 0);
  document.getElementById('kcCurSub').textContent =
    `${data.years.length} stage${data.years.length > 1 ? 's' : ''} · ${totalSubjects} subjects. Tap a stage to open it.`;
  document.getElementById('cpYears').innerHTML = data.years.map((y, i) => `
    <div class="kc-phase">
      <button class="kc-phase-head" onclick="toggleYear(this)" aria-expanded="false">
        <span class="kc-phase-num">${i + 1}</span>
        <span class="kc-phase-txt"><h3>${y.title}</h3><p>${y.desc}</p></span>
        <span class="kc-phase-count">${y.subjects.length}</span>
        <span class="kc-phase-arrow">▾</span>
      </button>
      <div class="kc-phase-body"><div>
        <ul class="kc-subjects">
          ${y.subjects.map(s => `
            <li>
              <span class="kc-sub-ico">${s.icon}</span>
              <div>
                <div class="kc-sub-name">${s.name}</div>
                ${s.desc ? `<div class="kc-sub-desc">${s.desc}</div>` : ''}
              </div>
              ${s.credits ? `<span class="kc-sub-cr">${s.credits}</span>` : ''}
            </li>`).join('')}
        </ul>
      </div></div>
    </div>`).join('');

  // Careers
  document.getElementById('cpCareers').innerHTML = data.careers.map((c, i) => `
    <div class="kc-career">
      <div class="kc-career-n">0${i + 1}</div>
      <div class="kc-career-ico">${c.icon}</div>
      <h4>${c.title}</h4>
      <p>${c.org}</p>
    </div>`).join('');

  // Show
  const overlay = document.getElementById('courseOverlay');
  overlay.classList.add('open');
  overlay.scrollTop = 0;
  document.querySelector('#kcTabs .kc-tabs-in').scrollLeft = 0;
  kcSpy();
  document.body.style.overflow = 'hidden';
}

function closeCourse() {
  document.getElementById('courseOverlay').classList.remove('open');
  document.body.style.overflow = '';
}

function toggleYear(header) {
  const block = header.closest('.kc-phase');
  const open = !block.classList.contains('open');
  block.classList.toggle('open', open);
  header.setAttribute('aria-expanded', open);
}

function kcGo(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Top bar turns solid + active tab follows scroll
function kcSpy() {
  const overlay = document.getElementById('courseOverlay');
  const top = document.querySelector('.kc-top');
  top.classList.toggle('solid', overlay.scrollTop > 60);
  let current = 'kcOverview';
  ['kcOverview', 'kcCurriculum', 'kcCareers'].forEach(id => {
    const el = document.getElementById(id);
    if (el && el.getBoundingClientRect().top <= 150) current = id;
  });
  document.querySelectorAll('#kcTabs button').forEach(b => {
    const on = b.dataset.target === current;
    if (on && !b.classList.contains('on')) b.scrollIntoView({ inline: 'center', block: 'nearest' });
    b.classList.toggle('on', on);
  });
}
document.getElementById('courseOverlay').addEventListener('scroll', kcSpy, { passive: true });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && document.getElementById('courseOverlay').classList.contains('open')) closeCourse();
});

// Bind buttons
document.querySelectorAll('.view-course-btn').forEach(btn => {
  btn.addEventListener('click', () => openCourse(btn.dataset.course));
});
