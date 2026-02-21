import { Injectable } from "@nestjs/common";
import type { UpdateUserDto } from "./dto/update-user.dto";
import type { CreateUserDto } from "./dto/user.dto";

@Injectable()
export class UserService {
  create(createUserDto: CreateUserDto) {
    return {
      message: "User created successfully",
      data: createUserDto,
    };
  }

  findAll() {
    return {
      message: "Users retrieved successfully",
      data: [],
    };
  }

  findOne(id: number) {
    return {
      message: "User found",
      data: { id },
    };
  }

  update(id: number, updateUserDto: UpdateUserDto) {
    return {
      message: "User updated successfully",
      data: { id, ...updateUserDto },
    };
  }

  remove(id: number) {
    return {
      message: "User removed successfully",
      data: { id },
    };
  }
}
