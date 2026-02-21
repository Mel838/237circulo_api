import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { CreateUserDto } from 'src/user/dto/create-user.dto';
import { User } from 'src/user/entities/user.entity';
import { LoginDto } from './dto/login.dto';

export interface AuthResponse {
  message: string;
  access_token: string;
  user: Partial<User>;
}

@Injectable()
export class UserAuthService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private jwtService: JwtService,
  ) {}

  async register(createUserDto: CreateUserDto): Promise<AuthResponse> {
    const existingUser = await this.userRepository.findOne({
      where: { email: createUserDto.email },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

    const user = this.userRepository.create({
      ...createUserDto,
      password: hashedPassword,
    });

    await this.userRepository.save(user);

    const { password, ...result } = user;
    const token = this.generateToken(user);

    return {
      message: 'User registered successfully',
      access_token: token,
      user: result,
    };
  }

  async login(loginDto: LoginDto): Promise<AuthResponse> {
    const user = await this.userRepository.findOne({
      where: { email: loginDto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.password || '',
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const { password, ...result } = user;
    const token = this.generateToken(user);

    return {
      message: 'Login successful',
      access_token: token,
      user: result,
    };
  }

  async validateUser(userId: string): Promise<User | null> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (user) {
      const { password, ...result } = user;
      return result as User;
    }

    return null;
  }

  private generateToken(user: User): string {
    const payload = {
      sub: user.id,
      email: user.email,
    };

    return this.jwtService.sign(payload);
  }

  async getUserById(
    userId: string,
  ): Promise<{ message: string; user: User } | null> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (user) {
      const { password, ...result } = user;
      return { message: 'User fetched successfully', user: result as User };
    }

    return null;
  }

  async getUser(): Promise<{ message: string; users: User[] }> {
    const users = await this.userRepository.find();
    return {
      message: 'Users fetched successfully',
      users: users.map(({ password, ...result }) => result as User),
    };
  }

  async deleteUser(userId: string): Promise<{ message: string }> {
    await this.userRepository.delete(userId);
    return { message: 'User deleted successfully' };
  }

  async updateUser(
    userId: string,
    updateData: Partial<User>,
  ): Promise<{ message: string; user: User }> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (updateData.password) {
      updateData.password = await bcrypt.hash(updateData.password, 10);
    }

    const updatedUser = this.userRepository.merge(user, updateData);
    await this.userRepository.save(updatedUser);

    const { password, ...result } = updatedUser;
    return { message: 'User updated successfully', user: result as User };
  }
}
