import { User } from '../src/models/User';
import { sequelize } from '../src/config/database';

beforeAll(async () => {
  await sequelize.authenticate();
});

afterAll(async () => {
  await sequelize.close();
});

describe('User Model', () => {
  describe('API Key Generation', () => {
    it('should generate API key on create', async () => {
      const user = await User.create({
        username: 'test_user_' + Date.now(),
        password: 'testpassword123',
      });

      expect(user.api_key).toBeTruthy();
      expect(user.api_key.length).toBeGreaterThan(30);
      expect(user.id).toBeTruthy();
    });

    it('should hash password on create', async () => {
      const username = 'test_hash_' + Date.now();
      const user = await User.create({
        username,
        password: 'mypassword',
      });

      expect(user.password).not.toBe('mypassword');
      expect(user.password.startsWith('$2b$')).toBe(true);
    });

    it('should verify correct password', async () => {
      const username = 'test_verify_' + Date.now();
      const user = await User.create({
        username,
        password: 'correctpass',
      });

      const isValid = await user.verifyPassword('correctpass');
      expect(isValid).toBe(true);

      const isInvalid = await user.verifyPassword('wrongpass');
      expect(isInvalid).toBe(false);
    });

    it('should regenerate API key', async () => {
      const username = 'test_regen_' + Date.now();
      const user = await User.create({
        username,
        password: 'testpass123',
      });

      const oldKey = user.api_key;
      const newKey = await user.regenerateApiKey();

      expect(newKey).toBeTruthy();
      expect(newKey).not.toBe(oldKey);
      expect(user.api_key).toBe(newKey);
    });

    it('should mask API key', async () => {
      const username = 'test_mask_' + Date.now();
      const user = await User.create({
        username,
        password: 'testpass123',
      });

      const masked = user.getMaskedApiKey();
      expect(masked).toContain('****');
      expect(masked).not.toBe(user.api_key);
    });
  });

  describe('findByApiKey', () => {
    it('should find user by API key', async () => {
      const username = 'test_findby_' + Date.now();
      const user = await User.create({
        username,
        password: 'testpass123',
      });

      const found = await User.findByApiKey(user.api_key);
      expect(found).toBeTruthy();
      expect(found?.username).toBe(username);
    });

    it('should return null for invalid API key', async () => {
      const found = await User.findByApiKey('nonexistent_key_12345');
      expect(found).toBeNull();
    });

    it('should not find inactive user', async () => {
      const username = 'test_inactive_' + Date.now();
      const user = await User.create({
        username,
        password: 'testpass123',
      });

      user.is_active = false;
      await user.save();

      const found = await User.findByApiKey(user.api_key);
      expect(found).toBeNull();

      // cleanup
      await user.destroy();
    });
  });

  describe('toJSON', () => {
    it('should not expose password in JSON', async () => {
      const username = 'test_json_' + Date.now();
      const user = await User.create({
        username,
        password: 'secret123',
      });

      const json = user.toJSON() as Record<string, unknown>;
      expect(json.password).toBeUndefined();
      expect(json.api_key).toBeTruthy(); // plaintext mode — api_key is visible
    });
  });
});
