# Luma Haven — Master Vision Prompt

This document is the authoritative product vision for Luma Haven: an original spiritual successor to the *idea* of the 1996 game *Creatures*, not a copy. It preserves the full brief used to drive development.

Work is broken into discrete tasks under [`docs/tasks/`](./tasks/README.md). No single session is expected to finish everything; use the task files to continue incrementally.

---

Build a fully functional 3D artificial-life game inspired by the spirit of the 1996 game *Creatures*, reimagined with modern technology, deeper intelligence, and a functioning society. This must be an original spiritual successor—not a direct copy—with its own world, creatures, visual identity, terminology, and systems.

The player should inhabit the same world as the creatures through a first-person perspective. The experience should combine an artificial-life simulation, immersive sandbox, social simulation, and survival game.

The creatures are the heart of the project. Prioritize the depth, intelligence, personality, relationships, genetics, and social lives of the creatures over graphics or world size. Begin with simple but coherent visuals and improve presentation only after the core simulation is engaging.

You may substantially refactor or replace the existing project. First inspect it for anything genuinely useful, then select the engine, architecture, AI systems, and technology stack that best support the vision.

## Primary goal

Create a small but living society populated by autonomous creatures that:

- Think, learn, remember, communicate, and make decisions
- Speak with the player and one another
- Experience physical needs, emotions, and psychological pressures
- Form friendships, families, rivalries, alliances, and communities
- Work, trade, own property, use services, and participate in an economy
- Fall in love, experience attraction and jealousy, choose partners, and reproduce
- Inherit genetics and personality tendencies from their parents
- Develop distinct identities through their experiences
- Produce surprising but understandable social stories

Their broad motivations are to survive, maintain their well-being, form meaningful connections, and pursue personally important goals. Different personalities, genetics, memories, social positions, and circumstances should cause them to pursue these goals in different ways.

The player should regularly wonder, “Why did that creature do that?” and be able to discover a believable answer.

## Performance target

The game will primarily run on an ASUS ROG Zephyrus G14 with an NVIDIA RTX 5070 Laptop GPU. It should run comfortably without constantly pushing the computer to maximum power, temperature, CPU usage, VRAM usage, or fan speed.

Target approximately 60 FPS during normal play at a sensible laptop resolution and medium-quality settings. Provide adjustable graphics and simulation settings so the player can trade visual quality, population size, and AI update frequency.

Design the simulation efficiently from the beginning:

- Use simulation level-of-detail so distant or sleeping creatures update less frequently
- Time-slice expensive AI decisions instead of updating every creature every frame
- Batch compatible AI calculations
- Cache navigation, memories, knowledge, and repeated decisions
- Use lightweight structured messages for most creature-to-creature communication
- Generate full natural-language dialogue primarily when the player can hear or inspect it
- Limit memory growth through summarization, importance scoring, consolidation, and forgetting
- Avoid requiring a separate large language-model instance for every creature
- Keep rendering and simulation rates independent
- Allow population limits and simulation complexity to be configured
- Profile actual CPU, GPU, memory, storage, and frame-time costs

Creatures do not need enormous models or save files. Aim for compact but meaningful minds. A configurable budget of roughly 1–10 MB of persistent data per established creature is reasonable, provided it is used efficiently. New creatures may begin much smaller. Store memories, relationships, genetics, learned knowledge, habits, and personality changes in compressed or structured formats.

The game should remain functional without an internet connection. Cloud or external AI services may be optionally supported, but they must not be mandatory.

## Technology choice

The current browser-based version is easy to run and publish, so retain the browser stack if it can meet the performance and simulation requirements.

If browser limitations significantly restrict creature intelligence, population size, persistence, multithreading, or performance, move to a suitable desktop engine or hybrid architecture. Choose a stack that is straightforward for the owner to install and run.

Regardless of the stack, provide:

- A simple launch process
- Clear setup instructions
- Automatic or easy save-file management
- Sensible default settings for the target laptop
- No unnecessary infrastructure or complicated deployment requirements

Make the decision based on profiling and practical results, not assumptions.

## Creature intelligence

Creatures must not operate as collections of rigid scripted routines. Give them only foundational instincts, physical abilities, and initial knowledge, then allow more complex behavior to emerge from interacting systems.

Use whichever combination of technologies works best. TensorFlow is an option, not a requirement. A hybrid architecture will likely be more practical than attempting to solve every problem with one neural network.

The intelligence architecture may combine:

- Basic instincts and reflexes
- Needs and utility-based decision-making
- Goal selection and planning
- Reinforcement or adaptive learning
- Associative learning and conditioning
- Working, episodic, semantic, and social memory
- Emotional appraisal
- Personality and temperament
- A simplified psychological model
- Natural-language generation and understanding
- Social reasoning and reputation
- Genetic predispositions
- Habits learned through repeated behavior

Use conventional game logic for mechanics that do not benefit from machine learning, such as collision detection, inventory validation, physical movement, navigation restrictions, and save-file integrity.

Creatures should not magically possess information they have never learned. They should be able to:

- Observe events
- Experiment and learn from consequences
- Ask questions and receive explanations
- Teach and imitate one another
- Form incomplete or incorrect beliefs
- Lie and detect possible deception
- Remember promises and mistreatment
- Generalize from previous experiences
- Develop habits, fears, preferences, and biases
- Forget or misremember less important information
- Change their minds when presented with evidence

Intelligence should be visible through behavior rather than represented only by an IQ statistic.

## Basic psyche

Each creature should have a simplified but meaningful psyche that connects physical condition, emotion, memory, personality, relationships, beliefs, and decision-making.

A creature’s psyche may include:

- Conscious goals
- Competing desires
- Mood and short-term emotions
- Stress and emotional regulation
- Attachment and social belonging
- Self-confidence or insecurity
- Curiosity and boredom
- Fear conditioning
- Personal values and preferences
- Expectations about other individuals
- Coping behaviors
- Psychological consequences from important experiences

The model should create believable behavior without attempting to reproduce the full complexity of human psychology or presenting itself as a medically accurate mental-health simulation.

## Emotions, love, and relationships

Model foundational emotional states such as:

- Happiness
- Sadness
- Fear
- Anger
- Affection
- Attraction
- Love
- Jealousy
- Loneliness
- Curiosity
- Pride
- Shame
- Guilt
- Gratitude
- Frustration
- Resentment
- Hope
- Grief

Emotions should arise from events, expectations, memories, relationships, physical conditions, and perceived threats or opportunities. They must influence attention, memory, dialogue, learning, risk tolerance, and decision-making.

Relationships should be persistent, asymmetric, and multidimensional. Track more than a single friendship score. Relevant dimensions may include:

- Familiarity
- Trust
- Affection
- Attraction
- Respect
- Fear
- Gratitude
- Suspicion
- Resentment
- Loyalty
- Dependence
- Shared history

Love should develop from compatibility, attraction, shared experiences, trust, personality, availability, and individual preferences. It should not be guaranteed or mechanically identical for every creature.

Creatures should be capable of courtship, partnership, family bonds, jealousy, rejection, separation, reconciliation, grief, and changing feelings. Relationships should be able to affect households, alliances, trading, work, conflict, and reproduction.

## Genetics, life cycle, and procreation

Creatures should have inheritable genetics that influence—but do not completely determine—their development.

Genetic traits may influence:

- Appearance
- Size and physical attributes
- Metabolism and health
- Lifespan
- Fertility
- Sensory strengths
- Learning tendencies
- Emotional sensitivity
- Temperament
- Sociability
- Curiosity
- Aggression
- Risk tolerance
- Resistance or vulnerability to illness and substances

Children should inherit a mixture of traits from their parents with limited mutation and variation. Personality and behavior should result from both inherited tendencies and life experience.

Include a life cycle such as birth, development, maturity, aging, and death. Reproduction should be an abstract, non-explicit game system based on mature creatures forming appropriate relationships and deciding whether conditions are suitable.

Parents and other community members should be able to care for, neglect, protect, teach, or influence younger creatures. Early experiences should meaningfully affect later development.

Prevent uncontrolled population growth through natural constraints such as fertility, resources, available housing, relationship choices, health, lifespan, and configurable population limits.

## Creature communication

The player must be able to communicate with creatures through typed natural-language messages. Creatures must also communicate meaningfully with one another.

Communication should support:

- Greetings and casual conversation
- Questions and explanations
- Teaching and learning
- Requests and commands
- Promises and warnings
- Negotiation and trade
- Affection, arguments, and apologies
- Gossip and reputation sharing
- Deception and persuasion
- Planning and coordination
- Asking for help
- Sharing discoveries
- Expressing needs and emotions

A creature’s speech should reflect its knowledge, vocabulary, mood, personality, age, memories, relationships, and current situation.

Creatures should not automatically believe or obey the player or one another. They should evaluate statements using trust, evidence, personal knowledge, incentives, emotional state, and reputation.

For performance, separate the meaning of communication from its wording. Store most communication as compact semantic messages or social events, then convert important or nearby conversations into natural language. This allows society-wide communication without continuously generating expensive dialogue for every creature.

## Society

The creatures should form a functioning society rather than merely occupy the same map.

The social simulation should support:

- Families and households
- Friend groups and rival groups
- Romantic partnerships
- Jobs and specialization
- Reputation and gossip
- Leaders or influential individuals
- Shared norms and informal rules
- Cooperation and collective projects
- Conflict and dispute resolution
- Social status and inequality
- Crime, consequences, forgiveness, and retaliation
- Cultural knowledge passed between generations

Social norms should be able to emerge or change through repeated behavior. Creatures may form expectations concerning ownership, theft, violence, trade, loyalty, family, public behavior, and responsibility.

Not every creature should behave identically. Some may be generous, dishonest, ambitious, cautious, loyal, manipulative, peaceful, impulsive, or rebellious.

Support emergent behavior such as friendship, cooperation, generosity, theft, lying, betrayal, rivalry, revenge, forgiveness, mentorship, manipulation, alliance-building, and sacrifice.

These actions should affect multiple systems. Theft, for example, may change ownership, memory, trust, reputation, economic access, dialogue, emotional state, and the probability of retaliation.

## Buildings and institutions

Create a compact settlement containing recognizable social institutions. Initially, these can be visually simple, but they must have practical functions.

Include or plan for:

- Homes where creatures sleep, store possessions, live with others, and seek privacy
- A hospital or clinic where illness and injuries can be treated
- A pharmacy where medicine can be acquired
- A bank where money or valuables can be stored securely
- Shops or markets for buying and selling goods
- A bar or social venue where creatures gather, drink, converse, trade information, and form relationships
- Workplaces that produce goods or provide services
- Public or communal spaces
- Storage and resource-gathering locations

Institutions should not merely be decorative. They should connect to creature needs, employment, schedules, money, ownership, relationships, and social behavior.

Where possible, institutions should be operated by creatures. A shop needs stock; a hospital needs medicine; a bank must track deposits; a bar must obtain drinks. Begin with simplified systems and deepen them over time.

## Items and substances

Create an extensible item system with enough early variety to produce different choices and social situations.

Initial or planned categories should include:

- Food and ingredients
- Water and other non-alcoholic drinks
- Alcoholic drinks
- Medicine and medical supplies
- Cigarettes and other fictionalized or age-appropriate society substances
- Tools
- Basic weapons, such as sticks
- Clothing or wearable items
- Money and valuables
- Containers and storage objects
- Gifts and sentimental possessions
- Trade goods
- Household objects
- Resources and crafting materials

Items should differ in value, weight, rarity, durability, legality or social acceptance, ownership, and usefulness.

Food, medicine, alcohol, tobacco, and other substances should produce understandable short- and long-term effects. Creatures may develop preferences, habits, tolerance, avoidance, or dependency where appropriate. These systems should add consequences and social depth rather than glamorize harmful substance use.

Weapons and violence may exist, but they should be governed by the same emotional, social, physical, and reputational systems as other behavior. Violence should have consequences such as injury, fear, resentment, treatment costs, damaged relationships, and retaliation.

Begin with a manageable but varied set of items, then make it easy to add more through data files rather than hard-coding every item.

## Player and creature movement

The player and creatures should have enough movement and interaction abilities to participate naturally in the world.

Support or plan for:

- Walking and running
- Looking around
- Jumping where appropriate
- Crouching
- Picking up and dropping objects
- Carrying, dragging, or moving suitable objects
- Using doors, furniture, beds, containers, and equipment
- Equipping and wielding tools or weapons
- Giving, receiving, trading, hiding, and stealing items
- Eating, drinking, and using medicine
- Contextual interactions with creatures and buildings
- Clear inventory and equipment controls

Creatures should use the same important world rules as the player. Avoid letting them teleport items, ignore ownership, or access resources without physically reaching them unless a deliberate simulation abstraction is required for distant creatures.

## Inventory and ownership

The player and every creature should have:

- A personal inventory
- Equipment or held-item slots
- Capacity or weight restrictions
- Personal possessions
- Access to household or institutional storage
- The ability to give, trade, store, hide, steal, or reclaim objects

Ownership should be recognized socially. Creatures should remember who possesses or owns important items, notice suspicious transfers, and respond according to personality, need, relationships, and local norms.

## Economy

Build a functioning local economy driven by scarcity, production, ownership, consumption, labor, and supply and demand.

Support:

- Money, barter, or both
- Employment and income
- Resource gathering
- Production and consumption
- Shops and inventories
- Negotiated trades
- Changing prices
- Specialization and division of labor
- Banking and secure deposits
- Debt and informal obligations
- Shortages and surpluses
- Wealth differences
- Theft, fraud, generosity, and charity
- Reputation affecting economic opportunities

Creatures should value items differently according to their needs, wealth, preferences, knowledge, relationships, habits, and expectations. Prices should not be completely fixed.

A hungry creature should value food more. A sick creature should prioritize medicine. A trusted friend may receive favorable terms. A shop with little stock may raise prices. A known thief may be refused service.

## Health and survival

Creatures should manage competing needs such as:

- Hunger
- Thirst
- Rest
- Safety
- Health
- Comfort
- Companionship
- Belonging
- Stimulation
- Privacy
- Purpose

Include injuries, illness, treatment, medicine, recovery, aging, and death at a level appropriate for the game.

Needs should generate interesting decisions rather than repetitive maintenance. Their importance should vary by creature, situation, age, health, personality, and learned habits.

## The world

Begin with a small, dense, functional settlement rather than a large empty map.

The initial world should contain:

- Several homes
- A clinic or hospital
- A pharmacy
- A bank
- A shop or market
- A bar or social venue
- Resource-gathering areas
- Workplaces
- Public gathering spaces
- Enough environmental variation to encourage exploration

Use basic graphics, simple geometry, reusable assets, and clear visual communication. The first milestone does not need photorealism. Atmosphere, readability, and interaction matter more than graphical complexity.

Later development can improve models, animation, lighting, sound, environment detail, and world size after the creature simulation is proven enjoyable.

## Persistence

The world and its inhabitants must persist across play sessions.

Save:

- Creature identities and genetics
- Age, health, and physical state
- Memories and learned knowledge
- Personality development
- Emotional tendencies
- Relationships and family trees
- Ownership and inventories
- Homes, jobs, and social roles
- Prices, supplies, bank accounts, and debts
- Important conversations and promises
- Reputation and major social events
- World changes

Use versioned, resilient save files and provide a way to recover gracefully from incomplete or corrupted data.

## Transparency and debugging

Emergent AI is difficult to understand and debug, so include optional tools that reveal:

- Current needs
- Mood and emotions
- Personality
- Active goals
- Intended actions
- Important memories
- Known facts and uncertain beliefs
- Relationships
- Genetic traits
- Recent communication
- Decision scores or short reasoning summaries
- Current job, possessions, money, and social role
- Learning and behavioral changes
- Performance cost per creature or system

These tools may be hidden during normal play but should make it possible to understand why a creature behaved in a particular way.

## Development priorities

Build a polished vertical slice before expanding the project.

The first complete version should include:

1. A small 3D settlement
2. Responsive first-person movement and interaction
3. A modest population of persistent creatures
4. Creature-to-player and creature-to-creature communication
5. Needs, emotions, personality, memory, and a basic psyche
6. Genetics, aging, relationships, love, and abstract reproduction
7. Families and social relationships
8. Inventories, ownership, tools, food, medicine, valuables, and several recreational substances
9. Homes, a shop, a clinic or hospital, a pharmacy, a bank, and a bar
10. Gathering, employment, trading, and a supply-and-demand economy
11. Trust, friendship, jealousy, theft, betrayal, rivalry, and forgiveness
12. Complete saving and loading
13. AI inspection and performance-debugging tools
14. Comfortable performance on the target laptop

Start with a limited number of creatures and items, but make the architecture data-driven and expandable.

## Quality requirements

The result must be a genuinely playable game—not merely a design document, visual mock-up, scripted demonstration, or disconnected AI experiment.

Prioritize:

- Believable and interesting creatures
- Emergent social stories
- Clear cause and effect
- Creature individuality
- Persistent development
- Stable performance
- Responsive controls
- Offline functionality
- Modular, maintainable architecture
- Automated tests for important simulation rules
- Graceful handling of unavailable optional AI services
- Straightforward installation and launching

Avoid fake complexity. Do not claim that creatures learn when they are merely selecting from predetermined story scenes. However, do not use expensive machine learning where a lightweight simulation would produce a better and more reliable result.

Make sensible creative and technical decisions independently. Add systems that strengthen the central fantasy of living among artificial creatures with their own minds, families, problems, desires, histories, and society.

Document the architecture, setup process, controls, completed systems, performance characteristics, and genuine limitations. The finished experience should make the player care about individual creatures and remain curious about what their society will become.
